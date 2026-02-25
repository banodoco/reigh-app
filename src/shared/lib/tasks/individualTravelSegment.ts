import {
  TaskValidationError,
  resolveProjectResolution,
  resolveSeed32Bit,
} from "../taskCreation";
import type { TaskCreationResult } from "../taskCreation";
import { getSupabaseClient } from '@/integrations/supabase/client';
import { PhaseConfig, buildBasicModePhaseConfig } from '@/shared/types/phaseConfig';
import type { PathLoraConfig } from '@/shared/types/lora';
import { ensureShotParentGenerationId } from './shotParentGeneration';
import { normalizeStructureGuidance } from '@/shared/lib/tasks/structureGuidance';
import { stripLegacyStructureParams } from './legacyStructureParams';
import { buildIndividualSegmentFamilyContract } from './taskFamilyContracts';
import { composeTaskFamilyPayload } from './taskPayloadContract';
import { composeTaskRequest } from './taskRequestComposer';
import { runTaskCreationPipeline } from './taskCreatorPipeline';
import {
  buildTaskPayloadSnapshot,
  resolveSnapshotOrchestratorTaskId,
  resolveSnapshotRunId,
} from './taskPayloadSnapshot';
import { readTravelContractData } from './travelContractData';
import {
  toRecordOrEmpty,
  asNumber,
  asString,
  firstDefined,
  resolveNumberCandidate,
  resolveStringCandidate,
  type UnknownRecord,
} from './taskParamParsers';
import { composeOptionalFields, resolveByPrecedence } from './taskFieldPolicy';
import {
  extractOrchestratorTaskIdParam,
  extractRunIdParam,
} from './taskParamContract';

/**
 * Interface for individual travel segment regeneration task parameters
 * This accepts the original segment params and rebuilds them for a standalone task
 */
interface IndividualTravelSegmentParams {
  project_id: string;
  
  // Parent generation to create variant for (optional - will be created if not provided)
  parent_generation_id?: string;
  
  // Shot ID to link the parent generation to (required if parent_generation_id is not provided)
  shot_id?: string;
  
  // Child generation being regenerated (for tracking)
  child_generation_id?: string;
  
  // The original segment params from the SegmentCard
  // This contains all the orchestrator_details, phase_config, etc.
  originalParams?: Record<string, unknown>;
  
  // Segment identification
  segment_index: number;
  
  // Input images for this segment (extracted from originalParams or provided)
  // end_image_url is optional for trailing segments (single-image-to-video mode)
  start_image_url: string;
  end_image_url?: string;
  
  // Generation IDs for the input images (for clickable images in SegmentCard)
  start_image_generation_id?: string;
  end_image_generation_id?: string;

  // Primary variant IDs for the input images (for "Load Images" feature)
  start_image_variant_id?: string;
  end_image_variant_id?: string;

  // Shot generation ID for the start image (for video-to-timeline tethering)
  // This allows videos to move with their source image when timeline is reordered
  pair_shot_generation_id?: string;
  
  // Overrides - these can override values from originalParams
  base_prompt?: string;
  // AI-enhanced prompt (kept separate from base_prompt, worker prefers this when present)
  enhanced_prompt?: string;
  negative_prompt?: string;
  num_frames?: number;
  seed?: number;
  random_seed?: boolean;
  amount_of_motion?: number;
  advanced_mode?: boolean;
  phase_config?: PhaseConfig;
  motion_mode?: 'basic' | 'presets' | 'advanced';
  selected_phase_preset_id?: string | null;
  loras?: PathLoraConfig[];
  structure_videos?: UnknownRecord[];

  // Optional generation name for the variant
  generation_name?: string;

  // Resolved width/height string from upstream task payloads.
  parsed_resolution_wh?: string;

  // Whether the new variant should be set as primary (default: true for backward compatibility)
  make_primary_variant?: boolean;

  // Segment position flags (auto-detected from end_image_url for trailing segments)
  is_last_segment?: boolean;
}

// Maximum frames allowed per segment (81-frame limit)
const MAX_SEGMENT_FRAMES = 81;

/**
 * Validates individual travel segment parameters
 */
function validateIndividualTravelSegmentParams(params: IndividualTravelSegmentParams): void {
  const errors: string[] = [];

  if (!params.project_id) {
    errors.push("project_id is required");
  }

  // Either parent_generation_id OR shot_id must be provided
  // (shot_id is used to create a new parent if none exists)
  if (!params.parent_generation_id && !params.shot_id) {
    errors.push("Either parent_generation_id or shot_id is required");
  }

  if (typeof params.segment_index !== 'number' || params.segment_index < 0) {
    errors.push("segment_index must be a non-negative number");
  }

  if (!params.start_image_url) {
    errors.push("start_image_url is required");
  }

  // end_image_url is optional for trailing segments (single-image-to-video mode)
  // When not provided, the GPU worker will generate video from just the start image

  // Enforce 81-frame limit per segment
  const numFrames = (
    typeof params.num_frames === 'number'
      ? params.num_frames
      : (typeof params.originalParams?.num_frames === 'number' ? params.originalParams.num_frames : undefined)
  ) ?? 49;
  if (numFrames > MAX_SEGMENT_FRAMES) {
    errors.push(`num_frames (${numFrames}) exceeds maximum of ${MAX_SEGMENT_FRAMES} frames per segment`);
  }

  if (errors.length > 0) {
    throw new TaskValidationError(errors.join(", "));
  }
}

/**
 * Builds the task params for an individual travel segment
 * Matches the exact structure of travel_segment tasks
 */
const DEFAULT_I2V_MODEL = "wan_2_2_i2v_lightning_baseline_2_2_2";

interface SegmentBuildState {
  orig: UnknownRecord;
  orchDetails: UnknownRecord;
  inputImages: string[];
  allInputImages: unknown;
  finalSeed: number;
  additionalLoras: Record<string, number>;
  motionMode: 'basic' | 'presets' | 'advanced';
  amountOfMotion: number;
  phaseConfig: PhaseConfig;
  advancedMode: boolean;
  loraMultipliers: Array<{ url: string; multiplier: number }>;
  modelName: string;
  flowShift: number;
  sampleSolver: string;
  guidanceScale: number;
  guidance2Scale: number;
  guidancePhases: number;
  numInferenceSteps: number;
  modelSwitchPhase: number;
  switchThreshold: unknown;
  numFrames: number;
  basePrompt: string;
  negativePrompt: string;
  enhancedPrompt?: string;
  fpsHelpers: number;
  segmentFramesExpanded: unknown;
  frameOverlapExpanded: unknown;
  structureGuidance?: UnknownRecord;
}

function asMotionMode(value: unknown): SegmentBuildState['motionMode'] | undefined {
  return value === 'basic' || value === 'presets' || value === 'advanced'
    ? value
    : undefined;
}

function asPhaseConfig(value: unknown): PhaseConfig | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const candidate = value as {
    num_phases?: unknown;
    steps_per_phase?: unknown;
    flow_shift?: unknown;
    sample_solver?: unknown;
    model_switch_phase?: unknown;
    phases?: unknown;
  };
  if (
    typeof candidate.num_phases !== 'number'
    || !Array.isArray(candidate.steps_per_phase)
    || !candidate.steps_per_phase.every((step) => typeof step === 'number')
    || typeof candidate.flow_shift !== 'number'
    || typeof candidate.sample_solver !== 'string'
    || typeof candidate.model_switch_phase !== 'number'
    || !Array.isArray(candidate.phases)
  ) {
    return undefined;
  }
  return value as PhaseConfig;
}

function buildInputImages(params: IndividualTravelSegmentParams): string[] {
  return params.end_image_url
    ? [params.start_image_url, params.end_image_url]
    : [params.start_image_url];
}

function resolveFinalSeed(
  params: IndividualTravelSegmentParams,
  orig: UnknownRecord,
  orchDetails: UnknownRecord
): number {
  const baseSeed = asNumber(orig.seed_to_use)
    ?? asNumber(orig.seed)
    ?? asNumber(orchDetails.seed_base)
    ?? 789;

  return resolveSeed32Bit({
    seed: params.seed,
    randomize: params.random_seed === true,
    fallbackSeed: baseSeed,
    field: 'seed',
  });
}

function mergeAdditionalLoraMap(
  target: Record<string, number>,
  source: unknown
): void {
  const sourceRecord = toRecordOrEmpty(source);
  for (const [path, strength] of Object.entries(sourceRecord)) {
    if (typeof strength === 'number') {
      target[path] = strength;
    }
  }
}

function buildAdditionalLoras(
  params: IndividualTravelSegmentParams,
  orig: UnknownRecord,
  orchDetails: UnknownRecord,
  contractAdditionalLoras?: UnknownRecord,
): Record<string, number> {
  const additionalLoras: Record<string, number> = {};

  if (params.loras !== undefined) {
    for (const lora of params.loras) {
      additionalLoras[lora.path] = lora.strength;
    }
    return additionalLoras;
  }

  if (contractAdditionalLoras) {
    mergeAdditionalLoraMap(additionalLoras, contractAdditionalLoras);
  }
  mergeAdditionalLoraMap(additionalLoras, orig.additional_loras);
  if (Object.keys(additionalLoras).length === 0) {
    mergeAdditionalLoraMap(additionalLoras, orchDetails.additional_loras);
  }
  return additionalLoras;
}

function resolveStructureGuidance(
  params: IndividualTravelSegmentParams,
  orig: UnknownRecord,
  orchDetails: UnknownRecord,
  contractStructureGuidance?: UnknownRecord,
): UnknownRecord | undefined {
  return normalizeStructureGuidance({
    structureGuidance: contractStructureGuidance ?? orig.structure_guidance ?? orchDetails.structure_guidance,
    structureVideos: params.structure_videos ?? orchDetails.structure_videos ?? orig.structure_videos,
    defaultVideoTreatment: 'adjust',
    defaultUni3cEndPercent: 0.1,
  });
}

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

function buildSegmentState(params: IndividualTravelSegmentParams): SegmentBuildState {
  const snapshot = buildTaskPayloadSnapshot(params.originalParams);
  const contractData = readTravelContractData(snapshot);
  const orig = snapshot.rawParams;
  const orchDetails = snapshot.orchestratorDetails;
  const inputImages = buildInputImages(params);
  const allInputImages = contractData.inputImages ?? inputImages;
  const finalSeed = resolveFinalSeed(params, orig, orchDetails);
  const additionalLoras = buildAdditionalLoras(params, orig, orchDetails, contractData.additionalLoras);
  const motionMode = (
    params.motion_mode
    ?? asMotionMode(contractData.motionMode)
    ?? 'basic'
  );
  const amountOfMotion = params.amount_of_motion
    ?? contractData.amountOfMotion
    ?? 0.5;
  const explicitPhaseConfig = (
    params.phase_config
    ?? asPhaseConfig(contractData.phaseConfig)
  );
  const phaseConfig = explicitPhaseConfig
    ?? buildBasicModePhaseConfig(false, amountOfMotion, params.loras ?? []);
  const advancedMode = motionMode === 'basic'
    ? false
    : (
      params.advanced_mode
      ?? contractData.advancedMode
      ?? !!explicitPhaseConfig
    );
  const loraMultipliers = phaseConfig.phases.flatMap((phase) =>
    (phase.loras || []).map((lora) => ({
      url: lora.url,
      multiplier: typeof lora.multiplier === 'number' ? lora.multiplier : Number(lora.multiplier) || 0,
    }))
  );
  const modelName = contractData.modelName
    ?? DEFAULT_I2V_MODEL;
  const flowShift = resolveNumberCandidate(
    phaseConfig.flow_shift,
    orig.flow_shift,
    orchDetails.flow_shift,
  ) ?? 5;
  const sampleSolver = resolveStringCandidate(
    phaseConfig.sample_solver,
    orig.sample_solver,
    orchDetails.sample_solver,
  ) ?? 'euler';
  const guidanceScale = resolveNumberCandidate(
    phaseConfig.phases?.[0]?.guidance_scale,
    orig.guidance_scale,
    orchDetails.guidance_scale,
  ) ?? 1;
  const guidance2Scale = resolveNumberCandidate(
    phaseConfig.phases?.[1]?.guidance_scale,
    orig.guidance2_scale,
    orchDetails.guidance2_scale,
  ) ?? 1;
  const guidancePhases = resolveNumberCandidate(
    phaseConfig.num_phases,
    orig.guidance_phases,
    orchDetails.guidance_phases,
  ) ?? 2;
  const numInferenceSteps = phaseConfig.steps_per_phase
    ? phaseConfig.steps_per_phase.reduce((sum: number, steps: number) => sum + steps, 0)
    : (
      resolveNumberCandidate(orig.num_inference_steps, orchDetails.num_inference_steps)
      ?? 6
    );
  const modelSwitchPhase = resolveNumberCandidate(
    phaseConfig.model_switch_phase,
    orig.model_switch_phase,
    orchDetails.model_switch_phase,
  ) ?? 1;
  const switchThreshold = firstDefined(orig.switch_threshold, orchDetails.switch_threshold);
  const rawNumFrames = resolveNumberCandidate(params.num_frames, orig.num_frames) ?? 49;
  const numFrames = Math.min(rawNumFrames, MAX_SEGMENT_FRAMES);
  const basePrompt = resolveStringCandidate(
    params.base_prompt,
    contractData.prompt,
    orig.base_prompt,
    orig.prompt,
  ) ?? "";
  const negativePrompt = resolveStringCandidate(
    params.negative_prompt,
    contractData.negativePrompt,
  ) ?? "";
  const enhancedPrompt = resolveStringCandidate(
    params.enhanced_prompt,
    contractData.enhancedPrompt,
  );
  const fpsHelpers = resolveNumberCandidate(orig.fps_helpers, orchDetails.fps_helpers) ?? 16;
  const segmentFramesExpanded = contractData.segmentFramesExpanded;
  const frameOverlapExpanded = contractData.frameOverlapExpanded;
  const structureGuidance = resolveStructureGuidance(
    params,
    orig,
    orchDetails,
    contractData.structureGuidance,
  );

  return {
    orig,
    orchDetails,
    inputImages,
    allInputImages,
    finalSeed,
    additionalLoras,
    motionMode,
    amountOfMotion,
    phaseConfig,
    advancedMode,
    loraMultipliers,
    modelName,
    flowShift,
    sampleSolver,
    guidanceScale,
    guidance2Scale,
    guidancePhases,
    numInferenceSteps,
    modelSwitchPhase,
    switchThreshold,
    numFrames,
    basePrompt,
    negativePrompt,
    enhancedPrompt,
    fpsHelpers,
    segmentFramesExpanded,
    frameOverlapExpanded,
    structureGuidance,
  };
}

function buildOrchestratorDetails(
  params: IndividualTravelSegmentParams,
  state: SegmentBuildState,
  finalResolution: string
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

interface SegmentPostProcessValues {
  motionMode: 'basic' | 'presets' | 'advanced';
  afterFirstPostGenerationSaturation: number;
  afterFirstPostGenerationBrightness: number;
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
  orchestratorDetails: UnknownRecord
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
  state: SegmentBuildState
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

function buildIndividualTravelSegmentParams(
  params: IndividualTravelSegmentParams,
  finalResolution: string
): Record<string, unknown> {
  const state = buildSegmentState(params);
  const orchestratorDetails = buildOrchestratorDetails(params, state, finalResolution);
  const sourceSnapshot = buildTaskPayloadSnapshot(params.originalParams);
  const legacyContractTaskId = extractOrchestratorTaskIdParam(params.originalParams);
  const legacyRunId = extractRunIdParam(params.originalParams);
  const orchestratorTaskId = resolveSnapshotOrchestratorTaskId(sourceSnapshot)
    ?? legacyContractTaskId
    ?? asString(state.orchDetails.orchestrator_task_id)
    ?? asString(state.orig.orchestrator_task_id_ref);
  const runId = resolveSnapshotRunId(sourceSnapshot)
    ?? legacyRunId
    ?? asString(state.orchDetails.run_id)
    ?? asString(state.orig.run_id);

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

/**
 * Creates an individual travel segment regeneration task
 * 
 * This creates a standalone task (visible in TasksPane) that regenerates
 * a single segment and creates a variant on the parent generation when complete.
 * The task params match the exact structure of travel_segment for GPU worker compatibility.
 * 
 * @param params - Individual travel segment parameters
 * @returns Promise resolving to the created task
 */
export async function createIndividualTravelSegmentTask(params: IndividualTravelSegmentParams): Promise<TaskCreationResult> {
  return runTaskCreationPipeline({
    params,
    context: 'IndividualTravelSegment',
    validate: validateIndividualTravelSegmentParams,
    buildTaskRequest: async (requestParams) => {
      const supabase = getSupabaseClient();

      const effectiveParentGenerationId = await ensureShotParentGenerationId({
        projectId: requestParams.project_id,
        shotId: requestParams.shot_id,
        parentGenerationId: requestParams.parent_generation_id,
        context: 'IndividualTravelSegment',
      });

      let effectiveChildGenerationId = requestParams.child_generation_id;

      if (!effectiveChildGenerationId && effectiveParentGenerationId) {
        if (requestParams.pair_shot_generation_id) {
          const { data: childByPairId, error: pairIdError } = await supabase
            .from('generations')
            .select('id')
            .eq('parent_generation_id', effectiveParentGenerationId)
            .eq('pair_shot_generation_id', requestParams.pair_shot_generation_id)
            .limit(1)
            .maybeSingle();

          if (pairIdError) {
            throw new Error(
              `IndividualTravelSegment.lookupChildByPairId failed: ${pairIdError.message}`,
            );
          }

          if (childByPairId) {
            effectiveChildGenerationId = childByPairId.id;
          }
        }

        if (!effectiveChildGenerationId && requestParams.segment_index !== undefined && !requestParams.pair_shot_generation_id) {
          const { data: childByOrder, error: orderError } = await supabase
            .from('generations')
            .select('id')
            .eq('parent_generation_id', effectiveParentGenerationId)
            .eq('child_order', requestParams.segment_index)
            .limit(1)
            .maybeSingle();

          if (orderError) {
            throw new Error(
              `IndividualTravelSegment.lookupChildByOrder failed: ${orderError.message}`,
            );
          }

          if (childByOrder) {
            effectiveChildGenerationId = childByOrder.id;
          }
        }
      }

      const paramsWithIds = {
        ...requestParams,
        parent_generation_id: effectiveParentGenerationId,
        child_generation_id: effectiveChildGenerationId,
      };

      const directResolution = asString(requestParams.parsed_resolution_wh);
      const originalParams = toRecordOrEmpty(requestParams.originalParams);
      const originalOrchestratorDetails = toRecordOrEmpty(originalParams.orchestrator_details);
      const origResolutionValue =
        originalParams.parsed_resolution_wh ?? originalOrchestratorDetails.parsed_resolution_wh;
      const origResolution = directResolution
        ?? (typeof origResolutionValue === 'string' ? origResolutionValue : undefined);
      const { resolution: finalResolution } = await resolveProjectResolution(
        requestParams.project_id,
        origResolution,
      );

      const taskParams = buildIndividualTravelSegmentParams(paramsWithIds, finalResolution);

      return composeTaskRequest({
        source: requestParams,
        taskType: 'individual_travel_segment',
        params: taskParams,
      });
    },
  });
}

// TaskValidationError is used internally - import from taskCreation.ts if needed externally
