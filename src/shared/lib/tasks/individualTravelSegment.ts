import {
  createTask,
  TaskValidationError,
  resolveProjectResolution
} from "../taskCreation";
import type { TaskCreationResult } from "../taskCreation";
import { supabase } from '@/integrations/supabase/client';
import { PhaseConfig, buildBasicModePhaseConfig } from '@/shared/types/phaseConfig';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import type { PathLoraConfig } from '@/shared/types/lora';
import { ensureShotParentGenerationId } from './shotParentGeneration';

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

  // Whether the new variant should be set as primary (default: true for backward compatibility)
  make_primary_variant?: boolean;

  // Smooth continuations (SVI) - for smoother transitions between segments
  use_svi?: boolean;
  svi_predecessor_video_url?: string;
  svi_strength_1?: number;
  svi_strength_2?: number;

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
const STRUCTURE_PREPROCESSING_MAP: Record<string, string> = {
  flow: 'flow',
  canny: 'canny',
  depth: 'depth',
  raw: 'none',
};
const LEGACY_STRUCTURE_PARAMS = [
  'structure_type',
  'structure_videos',
  'structure_video_path',
  'structure_video_treatment',
  'structure_video_motion_strength',
  'structure_video_type',
  'structure_canny_intensity',
  'structure_depth_contrast',
  'structure_guidance_video_url',
  'structure_guidance_frame_offset',
  'use_uni3c',
  'uni3c_guide_video',
  'uni3c_strength',
  'uni3c_start_percent',
  'uni3c_end_percent',
  'uni3c_guidance_frame_offset',
] as const;

type UnknownRecord = Record<string, unknown>;

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

function toRecordOrEmpty(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

function asRecordArray(value: unknown): UnknownRecord[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  return value
    .filter((item): item is UnknownRecord => !!item && typeof item === 'object' && !Array.isArray(item));
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
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

  return params.random_seed
    ? Math.floor(Math.random() * 1000000)
    : (params.seed ?? baseSeed);
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
  orchDetails: UnknownRecord
): Record<string, number> {
  const additionalLoras: Record<string, number> = {};

  if (params.loras !== undefined) {
    for (const lora of params.loras) {
      additionalLoras[lora.path] = lora.strength;
    }
    return additionalLoras;
  }

  mergeAdditionalLoraMap(additionalLoras, orig.additional_loras);
  if (Object.keys(additionalLoras).length === 0) {
    mergeAdditionalLoraMap(additionalLoras, orchDetails.additional_loras);
  }
  return additionalLoras;
}

function buildStructureGuidanceFromVideos(
  videos: UnknownRecord[],
  defaultUni3cEndPercent: number
): UnknownRecord {
  const firstVideo = videos[0];
  const structureType = asString(firstVideo.structure_type) ?? 'flow';
  const isUni3c = structureType === 'uni3c';

  const cleanedVideos = videos.map((video) => ({
    path: video.path,
    start_frame: video.start_frame ?? 0,
    end_frame: video.end_frame ?? null,
    treatment: video.treatment ?? 'adjust',
  }));

  const guidance: UnknownRecord = {
    target: isUni3c ? 'uni3c' : 'vace',
    videos: cleanedVideos,
    strength: firstVideo.motion_strength ?? 1.0,
  };

  if (isUni3c) {
    guidance.step_window = [
      firstVideo.uni3c_start_percent ?? 0,
      firstVideo.uni3c_end_percent ?? defaultUni3cEndPercent,
    ];
    guidance.frame_policy = 'fit';
    guidance.zero_empty_frames = true;
    return guidance;
  }

  guidance.preprocessing = STRUCTURE_PREPROCESSING_MAP[structureType] ?? 'flow';
  return guidance;
}

function resolveStructureGuidance(
  params: IndividualTravelSegmentParams,
  orig: UnknownRecord,
  orchDetails: UnknownRecord
): UnknownRecord | undefined {
  const existingGuidance = orig.structure_guidance ?? orchDetails.structure_guidance;
  if (existingGuidance && typeof existingGuidance === 'object' && !Array.isArray(existingGuidance)) {
    return existingGuidance;
  }

  const directStructureVideos = asRecordArray(params.structure_videos);
  if (directStructureVideos?.length) {
    return buildStructureGuidanceFromVideos(directStructureVideos, 0.1);
  }

  const legacyStructureVideos = (
    asRecordArray(orchDetails.structure_videos)
    ?? asRecordArray(orig.structure_videos)
  );

  if (legacyStructureVideos?.length) {
    return buildStructureGuidanceFromVideos(legacyStructureVideos, 1.0);
  }

  return undefined;
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
  const orig = toRecordOrEmpty(params.originalParams);
  const orchDetails = toRecordOrEmpty(orig.orchestrator_details);
  const inputImages = buildInputImages(params);
  const allInputImages = orchDetails.input_image_paths_resolved ?? inputImages;
  const finalSeed = resolveFinalSeed(params, orig, orchDetails);
  const additionalLoras = buildAdditionalLoras(params, orig, orchDetails);
  const motionMode = (
    params.motion_mode
    ?? asMotionMode(orig.motion_mode)
    ?? asMotionMode(orchDetails.motion_mode)
    ?? 'basic'
  );
  const amountOfMotion = params.amount_of_motion
    ?? asNumber(orig.amount_of_motion)
    ?? asNumber(orchDetails.amount_of_motion)
    ?? 0.5;
  const explicitPhaseConfig = (
    params.phase_config
    ?? asPhaseConfig(orig.phase_config)
    ?? asPhaseConfig(orchDetails.phase_config)
  );
  const phaseConfig = explicitPhaseConfig
    ?? buildBasicModePhaseConfig(false, amountOfMotion, params.loras ?? []);
  const advancedMode = motionMode === 'basic'
    ? false
    : (
      params.advanced_mode
      ?? asBoolean(orig.advanced_mode)
      ?? asBoolean(orchDetails.advanced_mode)
      ?? !!explicitPhaseConfig
    );
  const loraMultipliers = phaseConfig.phases.flatMap((phase) =>
    (phase.loras || []).map((lora) => ({
      url: lora.url,
      multiplier: typeof lora.multiplier === 'number' ? lora.multiplier : Number(lora.multiplier) || 0,
    }))
  );
  const modelName = asString(orig.model_name)
    ?? asString(orchDetails.model_name)
    ?? DEFAULT_I2V_MODEL;
  const flowShift = phaseConfig.flow_shift
    ?? asNumber(orig.flow_shift)
    ?? asNumber(orchDetails.flow_shift)
    ?? 5;
  const sampleSolver = phaseConfig.sample_solver
    ?? asString(orig.sample_solver)
    ?? asString(orchDetails.sample_solver)
    ?? 'euler';
  const guidanceScale = phaseConfig.phases?.[0]?.guidance_scale
    ?? asNumber(orig.guidance_scale)
    ?? asNumber(orchDetails.guidance_scale)
    ?? 1;
  const guidance2Scale = phaseConfig.phases?.[1]?.guidance_scale
    ?? asNumber(orig.guidance2_scale)
    ?? asNumber(orchDetails.guidance2_scale)
    ?? 1;
  const guidancePhases = phaseConfig.num_phases
    ?? asNumber(orig.guidance_phases)
    ?? asNumber(orchDetails.guidance_phases)
    ?? 2;
  const numInferenceSteps = phaseConfig.steps_per_phase
    ? phaseConfig.steps_per_phase.reduce((sum: number, steps: number) => sum + steps, 0)
    : (
      asNumber(orig.num_inference_steps)
      ?? asNumber(orchDetails.num_inference_steps)
      ?? 6
    );
  const modelSwitchPhase = phaseConfig.model_switch_phase
    ?? asNumber(orig.model_switch_phase)
    ?? asNumber(orchDetails.model_switch_phase)
    ?? 1;
  const switchThreshold = orig.switch_threshold ?? orchDetails.switch_threshold;
  const rawNumFrames = params.num_frames
    ?? asNumber(orig.num_frames)
    ?? 49;
  const numFrames = Math.min(rawNumFrames, MAX_SEGMENT_FRAMES);
  const basePrompt = params.base_prompt
    ?? asString(orig.base_prompt)
    ?? asString(orig.prompt)
    ?? "";
  const negativePrompt = params.negative_prompt
    ?? asString(orig.negative_prompt)
    ?? "";
  const enhancedPrompt = params.enhanced_prompt
    ?? asString(orig.enhanced_prompt);
  const fpsHelpers = asNumber(orig.fps_helpers)
    ?? asNumber(orchDetails.fps_helpers)
    ?? 16;
  const segmentFramesExpanded = orchDetails.segment_frames_expanded;
  const frameOverlapExpanded = orchDetails.frame_overlap_expanded;
  const structureGuidance = resolveStructureGuidance(params, orig, orchDetails);

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
    motion_mode: params.motion_mode ?? state.orchDetails.motion_mode ?? 'basic',
    amount_of_motion: state.amountOfMotion,
    parent_generation_id: params.parent_generation_id,
    fps_helpers: state.fpsHelpers,
    ...(state.segmentFramesExpanded ? { segment_frames_expanded: state.segmentFramesExpanded } : {}),
    ...(state.frameOverlapExpanded ? { frame_overlap_expanded: state.frameOverlapExpanded } : {}),
    ...(state.structureGuidance ? { structure_guidance: state.structureGuidance } : {}),
  };

  orchestratorDetails.use_svi = false;
  delete orchestratorDetails.svi_predecessor_video_url;
  delete orchestratorDetails.svi_strength_1;
  delete orchestratorDetails.svi_strength_2;
  for (const param of LEGACY_STRUCTURE_PARAMS) {
    delete orchestratorDetails[param];
  }

  orchestratorDetails.phase_config = state.phaseConfig;
  if (state.switchThreshold !== undefined) {
    orchestratorDetails.switch_threshold = state.switchThreshold;
  }
  if (state.loraMultipliers.length > 0) {
    orchestratorDetails.lora_multipliers = state.loraMultipliers;
  }

  return orchestratorDetails;
}

function buildTaskParamsPayload(
  params: IndividualTravelSegmentParams,
  state: SegmentBuildState,
  finalResolution: string,
  orchestratorDetails: UnknownRecord
): UnknownRecord {
  const taskParams: UnknownRecord = {
    flow_shift: state.flowShift,
    lora_names: state.orig.lora_names || state.orchDetails.lora_names || [],
    model_name: state.modelName,
    project_id: params.project_id,
    shot_id: params.shot_id,
    base_prompt: state.basePrompt,
    ...(state.enhancedPrompt ? { enhanced_prompt: state.enhancedPrompt } : {}),
    fps_helpers: state.orig.fps_helpers ?? state.orchDetails.fps_helpers ?? 16,
    seed_to_use: state.finalSeed,
    cfg_zero_step: state.orig.cfg_zero_step ?? -1,
    sample_solver: state.sampleSolver,
    segment_index: params.segment_index,
    guidance_scale: state.guidanceScale,
    ...(state.structureGuidance ? { structure_guidance: state.structureGuidance } : {}),
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
    ...(params.start_image_generation_id && { start_image_generation_id: params.start_image_generation_id }),
    ...(params.end_image_generation_id && { end_image_generation_id: params.end_image_generation_id }),
    ...(params.pair_shot_generation_id && { pair_shot_generation_id: params.pair_shot_generation_id }),
    after_first_post_generation_saturation: state.orig.after_first_post_generation_saturation
      ?? state.orchDetails.after_first_post_generation_saturation
      ?? 1,
    after_first_post_generation_brightness: state.orig.after_first_post_generation_brightness
      ?? state.orchDetails.after_first_post_generation_brightness
      ?? 0,
  };

  if (params.generation_name) {
    taskParams.generation_name = params.generation_name;
  }
  taskParams.make_primary_variant = params.make_primary_variant ?? true;

  return taskParams;
}

function buildIndividualSegmentParamsPayload(
  params: IndividualTravelSegmentParams,
  state: SegmentBuildState
): UnknownRecord {
  const individualSegmentParams: UnknownRecord = {
    input_image_paths_resolved: state.inputImages,
    start_image_url: params.start_image_url,
    ...(params.end_image_url && { end_image_url: params.end_image_url }),
    ...(params.start_image_generation_id && { start_image_generation_id: params.start_image_generation_id }),
    ...(params.end_image_generation_id && { end_image_generation_id: params.end_image_generation_id }),
    ...(params.pair_shot_generation_id && { pair_shot_generation_id: params.pair_shot_generation_id }),
    ...(params.start_image_variant_id && { start_image_variant_id: params.start_image_variant_id }),
    ...(params.end_image_variant_id && { end_image_variant_id: params.end_image_variant_id }),
    base_prompt: state.basePrompt,
    ...(state.enhancedPrompt ? { enhanced_prompt: state.enhancedPrompt } : {}),
    negative_prompt: state.negativePrompt,
    num_frames: state.numFrames,
    seed_to_use: state.finalSeed,
    random_seed: params.random_seed ?? false,
    amount_of_motion: state.amountOfMotion,
    motion_mode: params.motion_mode ?? state.orchDetails.motion_mode ?? 'basic',
    advanced_mode: state.advancedMode,
    additional_loras: state.additionalLoras,
    after_first_post_generation_saturation: state.orig.after_first_post_generation_saturation
      ?? state.orchDetails.after_first_post_generation_saturation
      ?? 1,
    after_first_post_generation_brightness: state.orig.after_first_post_generation_brightness
      ?? state.orchDetails.after_first_post_generation_brightness
      ?? 0,
    phase_config: state.phaseConfig,
  };

  if (params.selected_phase_preset_id) {
    individualSegmentParams.selected_phase_preset_id = params.selected_phase_preset_id;
  }

  return individualSegmentParams;
}

function buildIndividualTravelSegmentParams(
  params: IndividualTravelSegmentParams,
  finalResolution: string
): Record<string, unknown> {
  const state = buildSegmentState(params);
  const orchestratorDetails = buildOrchestratorDetails(params, state, finalResolution);
  const taskParams = buildTaskParamsPayload(params, state, finalResolution, orchestratorDetails);
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
  try {
    // 1. Validate parameters
    validateIndividualTravelSegmentParams(params);

    // 2. Ensure we have a canonical parent generation for this shot.
    // If one already exists, reuse it. If none exists yet, create exactly one.
    const effectiveParentGenerationId = await ensureShotParentGenerationId({
      projectId: params.project_id,
      shotId: params.shot_id,
      parentGenerationId: params.parent_generation_id,
      context: 'IndividualTravelSegment',
    });

    // 3. Look up existing child to create variant on
    // Priority: pair_shot_generation_id match > child_order match
    // This ensures we regenerate the correct video even if timeline was reordered
    let effectiveChildGenerationId = params.child_generation_id;
    
    if (!effectiveChildGenerationId && effectiveParentGenerationId) {
      // Strategy 1: Look for child with matching pair_shot_generation_id (most accurate)
      // Query the FK column (source of truth with referential integrity)
      if (params.pair_shot_generation_id) {
        const { data: childByPairId, error: pairIdError } = await supabase
          .from('generations')
          .select('id')
          .eq('parent_generation_id', effectiveParentGenerationId)
          .eq('pair_shot_generation_id', params.pair_shot_generation_id)
          .limit(1)
          .maybeSingle();

        if (!pairIdError && childByPairId) {
          effectiveChildGenerationId = childByPairId.id;
        }
      }

      // Strategy 2: Fallback to child_order match (legacy ONLY - skip if pair_shot_generation_id was provided)
      // If pair_shot_generation_id was provided but no match found, we want a NEW child for that pair,
      // not a variant on some unrelated video that happens to have the same child_order
      if (!effectiveChildGenerationId && params.segment_index !== undefined && !params.pair_shot_generation_id) {
        const { data: childByOrder, error: orderError } = await supabase
          .from('generations')
          .select('id')
          .eq('parent_generation_id', effectiveParentGenerationId)
          .eq('child_order', params.segment_index)
          .limit(1)
          .maybeSingle();

        if (!orderError && childByOrder) {
          effectiveChildGenerationId = childByOrder.id;
        }
      }
    }
    
    // Update params with the effective IDs
    const paramsWithIds = {
      ...params,
      parent_generation_id: effectiveParentGenerationId,
      child_generation_id: effectiveChildGenerationId,
    };

    // 4. Resolve project resolution (use original if available)
    const originalParams = toRecordOrEmpty(params.originalParams);
    const originalOrchestratorDetails = toRecordOrEmpty(originalParams.orchestrator_details);
    const origResolutionValue =
      originalParams.parsed_resolution_wh ?? originalOrchestratorDetails.parsed_resolution_wh;
    const origResolution = typeof origResolutionValue === 'string' ? origResolutionValue : undefined;
    const { resolution: finalResolution } = await resolveProjectResolution(
      params.project_id,
      origResolution
    );

    // 5. Build task params matching travel_segment structure
    const taskParams = buildIndividualTravelSegmentParams(paramsWithIds, finalResolution);

    // 6. Create task using unified create-task function
    const result = await createTask({
      project_id: params.project_id,
      task_type: 'individual_travel_segment',
      params: taskParams
    });

    return result;

  } catch (error) {
    handleError(error, { context: 'IndividualTravelSegment', showToast: false });
    throw error;
  }
}

// TaskValidationError is used internally - import from taskCreation.ts if needed externally
