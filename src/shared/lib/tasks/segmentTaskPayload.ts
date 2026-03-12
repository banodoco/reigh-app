import {
  stripDuplicateStructureDetailParams,
  stripLegacyStructureParams,
} from './legacyStructureParams';
import { buildIndividualSegmentFamilyContract } from './core/taskFamilyContracts';
import { composeTaskFamilyPayload } from './taskPayloadContract';
import {
  buildTaskPayloadSnapshot,
  resolveSnapshotOrchestratorTaskId,
  resolveSnapshotRunId,
} from './taskPayloadSnapshot';
import {
  asNumber,
  asString,
  resolveStringCandidate,
  type UnknownRecord,
} from './taskParamParsers';
import {
  extractOrchestratorTaskIdParam,
  extractRunIdParam,
} from './taskParamContract';
import { composeOptionalFields, resolveByPrecedence } from './core/taskFieldPolicy';
import type {
  IndividualTravelSegmentParams,
  SegmentBuildState,
  SegmentPostProcessValues,
} from './families/individualTravelSegment/types';
import { asMotionMode } from './segmentTypeCoercers';
import { buildSegmentState } from './segmentStateResolvers';

function stripOrchestratorReferences(orchDetails: UnknownRecord): UnknownRecord {
  const {
    orchestrator_task_id: _removedOrchTaskId,
    orchestrator_task_id_ref: _removedOrchTaskIdRef,
    run_id: _removedRunId,
    orchestrator_run_id: _removedOrchRunId,
    ...remainingDetails
  } = orchDetails;
  return remainingDetails;
}

function buildOrchestratorDetails(
  params: IndividualTravelSegmentParams,
  state: SegmentBuildState,
  finalResolution: string,
): UnknownRecord {
  const motionMode = resolveByPrecedence(
    params.motion_mode,
    asString(state.orchDetails.motion_mode),
    'basic',
  );
  const orchestratorDetails: UnknownRecord = {
    ...stripOrchestratorReferences(state.orchDetails),
    generation_source: 'individual_segment',
    parsed_resolution_wh: finalResolution,
    input_image_paths_resolved: state.allInputImages,
    seed_base: state.finalSeed,
    model_name: state.modelName,
    flow_shift: state.flowShift,
    sample_solver: state.sampleSolver,
    guidance_scale: state.guidanceScale,
    guidance2_scale: state.guidance2Scale,
    guidance_phases: state.guidancePhases,
    num_inference_steps: state.numInferenceSteps,
    model_switch_phase: state.modelSwitchPhase,
    additional_loras: state.additionalLoras,
    advanced_mode: state.advancedMode,
    motion_mode: motionMode,
    amount_of_motion: state.amountOfMotion,
    parent_generation_id: params.parent_generation_id,
    fps_helpers: state.fpsHelpers,
    ...composeOptionalFields([
      {
        key: 'segment_frames_expanded',
        value: state.segmentFramesExpanded,
        include: (value) => Boolean(value),
      },
      {
        key: 'frame_overlap_expanded',
        value: state.frameOverlapExpanded,
        include: (value) => Boolean(value),
      },
      {
        key: 'structure_guidance',
        value: state.structureGuidance,
        include: (value) => Boolean(value),
      },
    ]),
  };

  delete orchestratorDetails.use_svi;
  delete orchestratorDetails.svi_predecessor_video_url;
  delete orchestratorDetails.svi_strength_1;
  delete orchestratorDetails.svi_strength_2;
  stripLegacyStructureParams(orchestratorDetails);
  stripDuplicateStructureDetailParams(orchestratorDetails);

  orchestratorDetails.phase_config = state.phaseConfig;
  Object.assign(
    orchestratorDetails,
    composeOptionalFields([
      {
        key: 'switch_threshold',
        value: state.switchThreshold,
      },
      {
        key: 'lora_multipliers',
        value: state.loraMultipliers,
        include: (value) => Array.isArray(value) && value.length > 0,
      },
    ]),
  );

  return orchestratorDetails;
}

function resolveSegmentPostProcessValues(
  params: IndividualTravelSegmentParams,
  state: SegmentBuildState,
): SegmentPostProcessValues {
  return {
    motionMode: resolveByPrecedence(
      params.motion_mode,
      asMotionMode(state.orchDetails.motion_mode),
      'basic',
    ),
    afterFirstPostGenerationSaturation: resolveByPrecedence(
      asNumber(state.orig.after_first_post_generation_saturation),
      asNumber(state.orchDetails.after_first_post_generation_saturation),
      1,
    ),
    afterFirstPostGenerationBrightness: resolveByPrecedence(
      asNumber(state.orig.after_first_post_generation_brightness),
      asNumber(state.orchDetails.after_first_post_generation_brightness),
      0,
    ),
  };
}

function buildTaskParamsPayload(
  params: IndividualTravelSegmentParams,
  state: SegmentBuildState,
  finalResolution: string,
  orchestratorDetails: UnknownRecord,
): UnknownRecord {
  const segmentPostProcess = resolveSegmentPostProcessValues(params, state);

  const taskParams: UnknownRecord = {
    flow_shift: state.flowShift,
    lora_names: state.orig.lora_names || state.orchDetails.lora_names || [],
    model_name: state.modelName,
    project_id: params.project_id,
    shot_id: params.shot_id,
    base_prompt: state.basePrompt,
    fps_helpers: state.orig.fps_helpers ?? state.orchDetails.fps_helpers ?? 16,
    seed_to_use: state.finalSeed,
    cfg_zero_step: state.orig.cfg_zero_step ?? -1,
    sample_solver: state.sampleSolver,
    segment_index: params.segment_index,
    guidance_scale: state.guidanceScale,
    cfg_star_switch: state.orig.cfg_star_switch ?? 0,
    guidance2_scale: state.guidance2Scale,
    guidance_phases: state.guidancePhases,
    is_last_segment: params.is_last_segment ?? state.orig.is_last_segment ?? false,
    negative_prompt: state.negativePrompt,
    is_first_segment: state.orig.is_first_segment ?? (params.segment_index === 0),
    additional_loras: state.additionalLoras,
    lora_multipliers: state.loraMultipliers,
    switch_threshold: state.switchThreshold,
    debug_mode_enabled: state.orig.debug_mode_enabled ?? state.orchDetails.debug_mode_enabled ?? false,
    model_switch_phase: state.modelSwitchPhase,
    num_inference_steps: state.numInferenceSteps,
    parsed_resolution_wh: finalResolution,
    num_frames: state.numFrames,
    amount_of_motion: state.amountOfMotion,
    orchestrator_details: orchestratorDetails,
    parent_generation_id: params.parent_generation_id,
    child_generation_id: params.child_generation_id,
    input_image_paths_resolved: state.inputImages,
    after_first_post_generation_saturation: segmentPostProcess.afterFirstPostGenerationSaturation,
    after_first_post_generation_brightness: segmentPostProcess.afterFirstPostGenerationBrightness,
    motion_mode: segmentPostProcess.motionMode,
  };

  Object.assign(
    taskParams,
    composeOptionalFields([
      {
        key: 'enhanced_prompt',
        value: state.enhancedPrompt,
        include: (value) => typeof value === 'string' && value.length > 0,
      },
      {
        key: 'structure_guidance',
        value: state.structureGuidance,
        include: (value) => Boolean(value),
      },
      {
        key: 'structure_videos',
        value: state.structureVideos,
        include: (value) => Array.isArray(value) && value.length > 0,
      },
      {
        key: 'start_image_generation_id',
        value: params.start_image_generation_id,
        include: (value) => typeof value === 'string' && value.length > 0,
      },
      {
        key: 'end_image_generation_id',
        value: params.end_image_generation_id,
        include: (value) => typeof value === 'string' && value.length > 0,
      },
      {
        key: 'pair_shot_generation_id',
        value: params.pair_shot_generation_id,
        include: (value) => typeof value === 'string' && value.length > 0,
      },
      {
        key: 'generation_name',
        value: params.generation_name,
        include: (value) => typeof value === 'string' && value.length > 0,
      },
    ]),
  );

  taskParams.make_primary_variant = params.make_primary_variant ?? true;
  return taskParams;
}

function buildIndividualSegmentParamsPayload(
  params: IndividualTravelSegmentParams,
  state: SegmentBuildState,
): UnknownRecord {
  const segmentPostProcess = resolveSegmentPostProcessValues(params, state);

  const individualSegmentParams: UnknownRecord = {
    input_image_paths_resolved: state.inputImages,
    start_image_url: params.start_image_url,
    base_prompt: state.basePrompt,
    negative_prompt: state.negativePrompt,
    num_frames: state.numFrames,
    seed_to_use: state.finalSeed,
    random_seed: params.random_seed ?? false,
    amount_of_motion: state.amountOfMotion,
    motion_mode: segmentPostProcess.motionMode,
    advanced_mode: state.advancedMode,
    additional_loras: state.additionalLoras,
    after_first_post_generation_saturation: segmentPostProcess.afterFirstPostGenerationSaturation,
    after_first_post_generation_brightness: segmentPostProcess.afterFirstPostGenerationBrightness,
    phase_config: state.phaseConfig,
  };

  Object.assign(
    individualSegmentParams,
    composeOptionalFields([
      {
        key: 'end_image_url',
        value: params.end_image_url,
        include: (value) => typeof value === 'string' && value.length > 0,
      },
      {
        key: 'start_image_generation_id',
        value: params.start_image_generation_id,
        include: (value) => typeof value === 'string' && value.length > 0,
      },
      {
        key: 'end_image_generation_id',
        value: params.end_image_generation_id,
        include: (value) => typeof value === 'string' && value.length > 0,
      },
      {
        key: 'pair_shot_generation_id',
        value: params.pair_shot_generation_id,
        include: (value) => typeof value === 'string' && value.length > 0,
      },
      {
        key: 'start_image_variant_id',
        value: params.start_image_variant_id,
        include: (value) => typeof value === 'string' && value.length > 0,
      },
      {
        key: 'end_image_variant_id',
        value: params.end_image_variant_id,
        include: (value) => typeof value === 'string' && value.length > 0,
      },
      {
        key: 'enhanced_prompt',
        value: state.enhancedPrompt,
        include: (value) => typeof value === 'string' && value.length > 0,
      },
      {
        key: 'selected_phase_preset_id',
        value: params.selected_phase_preset_id,
        include: (value) => typeof value === 'string' && value.length > 0,
      },
    ]),
  );

  return individualSegmentParams;
}

export function buildIndividualTravelSegmentParams(
  params: IndividualTravelSegmentParams,
  finalResolution: string,
): Record<string, unknown> {
  const state = buildSegmentState(params);
  const orchestratorDetails = buildOrchestratorDetails(params, state, finalResolution);
  const sourceSnapshot = buildTaskPayloadSnapshot(params.originalParams);
  const legacyContractTaskId = extractOrchestratorTaskIdParam(params.originalParams);
  const legacyRunId = extractRunIdParam(params.originalParams);
  const orchestratorTaskId = resolveSnapshotOrchestratorTaskId(sourceSnapshot)
    ?? legacyContractTaskId
    ?? resolveStringCandidate(
      asString(state.orchDetails.orchestrator_task_id),
      asString(state.orig.orchestrator_task_id_ref),
    );
  const runId = resolveSnapshotRunId(sourceSnapshot)
    ?? legacyRunId
    ?? asString(state.orchDetails.run_id);

  const hasPairShotGenerationId = Boolean(
    params.pair_shot_generation_id
    || params.start_image_variant_id
    || params.end_image_variant_id,
  );
  const segmentRegenerationMode = hasPairShotGenerationId
    ? 'segment_regen_from_pair'
    : 'segment_regen_from_order';
  const generationRouting = params.child_generation_id
    ? 'variant_child'
    : 'child_generation';

  const familyContract = buildIndividualSegmentFamilyContract({
    segmentRegenerationMode,
    generationRouting,
    segmentIndex: params.segment_index,
    hasEndImage: Boolean(params.end_image_url),
    hasPairShotGenerationId,
  });

  const composedPayload = composeTaskFamilyPayload({
    taskFamily: 'individual_travel_segment',
    orchestratorDetails,
    orchestrationInput: {
      taskFamily: 'individual_travel_segment',
      orchestratorTaskId,
      runId,
      parentGenerationId: params.parent_generation_id,
      childGenerationId: params.child_generation_id,
      childOrder: params.segment_index,
      shotId: params.shot_id,
      generationRouting,
      siblingLookup: runId ? 'run_id' : 'orchestrator_task_id',
      segmentRegenerationMode,
    },
    taskViewInput: {
      inputImages: state.inputImages,
      prompt: state.basePrompt,
      enhancedPrompt: state.enhancedPrompt,
      negativePrompt: state.negativePrompt,
      modelName: state.modelName,
      resolution: finalResolution,
    },
    familyContract,
  });

  const taskParams = {
    ...buildTaskParamsPayload(params, state, finalResolution, orchestratorDetails),
    ...composedPayload,
  };
  taskParams.individual_segment_params = buildIndividualSegmentParamsPayload(params, state);
  return taskParams;
}
