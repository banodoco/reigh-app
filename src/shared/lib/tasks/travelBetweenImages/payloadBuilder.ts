import {
  expandArrayToCount,
  resolveSeed32Bit,
  validateRequiredFields,
  TaskValidationError,
  safeParseJson,
} from "../../taskCreation";
import type { TravelBetweenImagesTaskInput } from './types';
import {
  DEFAULT_VIDEO_STRUCTURE_PARAMS,
  DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES,
} from './defaults';
import { normalizeStructureGuidance } from '@/shared/lib/tasks/structureGuidance';
import {
  buildTravelBetweenImagesFamilyContract,
  TASK_FAMILY_CONTRACT_VERSION,
  type TravelBetweenImagesReadContract,
} from '../taskFamilyContracts';
import { composeTaskFamilyPayload } from '../taskPayloadContract';
import { toRecordOrEmpty, asNumber } from '../taskParamParsers';

const LEGACY_TRAVEL_STRUCTURE_FIELDS = [
  'structure_video_path',
  'structure_video_treatment',
  'structure_video_motion_strength',
  'structure_video_type',
  'use_uni3c',
  'uni3c_start_percent',
  'uni3c_end_percent',
] as const;
const LEGACY_TRAVEL_STRUCTURE_VIDEO_FIELDS = [
  'motion_strength',
  'structure_type',
  'uni3c_start_percent',
  'uni3c_end_percent',
] as const;

type LegacyTravelStructureField = (typeof LEGACY_TRAVEL_STRUCTURE_FIELDS)[number];
type LegacyTravelStructureVideoField = (typeof LEGACY_TRAVEL_STRUCTURE_VIDEO_FIELDS)[number];

function isLengthOneOrExpected(value: unknown, expected: number): boolean {
  return Array.isArray(value) && (value.length === 1 || value.length === expected);
}

function isLengthExpected(value: unknown, expected: number): boolean {
  return Array.isArray(value) && value.length === expected;
}

function validatePairScopedArray(
  field: keyof TravelBetweenImagesTaskInput,
  value: unknown,
  pairCount: number,
  label: string,
  allowSingleValueExpansion = true,
): void {
  if (!Array.isArray(value)) {
    return;
  }
  const isValid = allowSingleValueExpansion
    ? isLengthOneOrExpected(value, pairCount)
    : isLengthExpected(value, pairCount);
  if (isValid) {
    return;
  }
  const expectedText = allowSingleValueExpansion ? `1 or ${pairCount}` : `${pairCount}`;
  throw new TaskValidationError(
    `${label} must contain ${expectedText} item(s) to match ${pairCount} image pair(s)`,
    field,
  );
}

function validateImageScopedArray(
  field: keyof TravelBetweenImagesTaskInput,
  value: unknown,
  imageCount: number,
  label: string,
): void {
  if (!Array.isArray(value)) {
    return;
  }
  if (value.length === imageCount) {
    return;
  }
  throw new TaskValidationError(
    `${label} must contain ${imageCount} item(s) to match image_urls`,
    field,
  );
}

function assertNoImplicitLegacyStructureFields(params: TravelBetweenImagesTaskInput): void {
  const topLevelLegacyFields = LEGACY_TRAVEL_STRUCTURE_FIELDS.filter((field) => params[field] !== undefined);
  const structureVideos = Array.isArray(params.structure_videos) ? params.structure_videos : [];
  const structureVideoLegacyFields = LEGACY_TRAVEL_STRUCTURE_VIDEO_FIELDS.filter((field) =>
    structureVideos.some((entry) =>
      Boolean(
        entry
        && typeof entry === 'object'
        && !Array.isArray(entry)
        && (entry as Record<string, unknown>)[field] !== undefined,
      )),
  );
  const usedLegacyFields = [...topLevelLegacyFields, ...structureVideoLegacyFields];
  if (usedLegacyFields.length === 0) {
    return;
  }
  throw new TaskValidationError(
    `Legacy structure-video fields are not accepted in canonical mode (${usedLegacyFields.join(', ')}). ` +
      'Use structure_guidance + structure_videos, or pass explicit legacyStructureCompatibility for temporary migration paths.',
    usedLegacyFields[0],
  );
}

function buildAdditionalLorasRecord(params: TravelBetweenImagesTaskInput): Record<string, number> | undefined {
  if (!params.loras || params.loras.length === 0) {
    return undefined;
  }

  return params.loras.reduce<Record<string, number>>((acc, lora) => {
    acc[lora.path] = lora.strength;
    return acc;
  }, {});
}

/**
 * Validates travel between images task parameters
 *
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
export function validateTravelBetweenImagesParams(params: TravelBetweenImagesTaskInput): void {
  validateRequiredFields({ ...params }, [
    'project_id',
    'image_urls',
    'base_prompts',
    'segment_frames',
    'frame_overlap'
  ]);

  // Additional steerable motion specific validations
  if (params.image_urls.length === 0) {
    throw new TaskValidationError("At least one image_url is required", 'image_urls');
  }

  if (params.base_prompts.length === 0) {
    throw new TaskValidationError("base_prompts is required (at least one prompt)", 'base_prompts');
  }

  if (params.segment_frames.length === 0) {
    throw new TaskValidationError("segment_frames is required", 'segment_frames');
  }

  if (params.frame_overlap.length === 0) {
    throw new TaskValidationError("frame_overlap is required", 'frame_overlap');
  }

  const imageCount = params.image_urls.length;
  const pairCount = Math.max(1, imageCount - 1);

  validatePairScopedArray('base_prompts', params.base_prompts, pairCount, 'base_prompts');
  validatePairScopedArray('segment_frames', params.segment_frames, pairCount, 'segment_frames');
  validatePairScopedArray('frame_overlap', params.frame_overlap, pairCount, 'frame_overlap');
  validatePairScopedArray('negative_prompts', params.negative_prompts, pairCount, 'negative_prompts');
  validatePairScopedArray('enhanced_prompts', params.enhanced_prompts, pairCount, 'enhanced_prompts');
  validatePairScopedArray('pair_phase_configs', params.pair_phase_configs, pairCount, 'pair_phase_configs', false);
  validatePairScopedArray('pair_loras', params.pair_loras, pairCount, 'pair_loras', false);
  validatePairScopedArray('pair_motion_settings', params.pair_motion_settings, pairCount, 'pair_motion_settings', false);
  validatePairScopedArray('pair_shot_generation_ids', params.pair_shot_generation_ids, pairCount, 'pair_shot_generation_ids', false);

  validateImageScopedArray('image_generation_ids', params.image_generation_ids, imageCount, 'image_generation_ids');
  validateImageScopedArray('image_variant_ids', params.image_variant_ids, imageCount, 'image_variant_ids');
}

/**
 * Processes travel between images parameters and builds the orchestrator payload.
 * This replicates the logic from the original steerable-motion edge function.
 *
 * @param params - Raw travel between images parameters
 * @param finalResolution - Resolved resolution string (e.g. "1280x720")
 * @param taskId - Orchestrator task ID for the payload
 * @param runId - Run ID for grouping related tasks
 * @param parentGenerationId - Parent generation ID to include in payload
 * @returns Processed orchestrator payload
 */
export function buildTravelBetweenImagesPayload(
  params: TravelBetweenImagesTaskInput,
  finalResolution: string,
  taskId: string,
  runId: string,
  parentGenerationId?: string,
): Record<string, unknown> {
  assertNoImplicitLegacyStructureFields(params);

  // Calculate number of segments (matching original logic)
  const numSegments = Math.max(1, params.image_urls.length - 1);

  // Expand arrays if they have a single element and numSegments > 1
  const basePromptsExpanded = expandArrayToCount(params.base_prompts, numSegments);
  const negativePromptsExpanded = expandArrayToCount(params.negative_prompts, numSegments) || Array(numSegments).fill("");

  // CRITICAL FIX: Only expand enhanced_prompts if they were actually provided OR if enhance_prompt is requested
  // If enhance_prompt is true, we must provide an array (even if empty strings) for the backend to populate
  const enhancedPromptsExpanded = params.enhanced_prompts
    ? expandArrayToCount(params.enhanced_prompts, numSegments)
    : (params.enhance_prompt ? Array(numSegments).fill("") : undefined);

  const segmentFramesExpanded = expandArrayToCount(params.segment_frames, numSegments);
  const frameOverlapExpanded = expandArrayToCount(params.frame_overlap, numSegments);

  // Extract steps parameter - only needed if NOT in Advanced Mode
  // In Advanced Mode, steps come from steps_per_phase in phase_config
  let stepsValue = params.steps;
  if (!params.advanced_mode) {
    if (stepsValue === undefined && params.params_json_str) {
      const parsedParams = toRecordOrEmpty(safeParseJson(params.params_json_str, {}));
      const parsedSteps = asNumber(parsedParams.steps);
      if (parsedSteps !== undefined) {
        stepsValue = parsedSteps;
      }
    }
    if (stepsValue === undefined) {
      stepsValue = DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.steps;
    }
  }

  // Handle random seed generation - if random_seed is true, generate a new random seed
  // Otherwise use the provided seed or default
  const finalSeed = resolveSeed32Bit({
    seed: params.seed,
    randomize: params.random_seed === true,
    fallbackSeed: DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.seed,
    field: 'seed',
  });

  // Build orchestrator payload matching the original edge function structure
  const orchestratorPayload: Record<string, unknown> = {
    // Common identifier for comparing batch vs individual segment generation
    generation_source: 'batch',
    orchestrator_task_id: taskId,
    run_id: runId,
    input_image_paths_resolved: params.image_urls,
    // Include generation IDs for clickable images in SegmentCard
    ...(params.image_generation_ids && params.image_generation_ids.length > 0
      ? { input_image_generation_ids: params.image_generation_ids }
      : {}),
    // Include pair shot generation IDs for stable segment tethering
    ...(params.pair_shot_generation_ids && params.pair_shot_generation_ids.length > 0
      ? { pair_shot_generation_ids: params.pair_shot_generation_ids }
      : {}),
    num_new_segments_to_generate: numSegments,
    base_prompts_expanded: basePromptsExpanded,
    base_prompt: params.base_prompt, // Singular - the default/base prompt
    negative_prompts_expanded: negativePromptsExpanded,
    // CRITICAL FIX: Only include enhanced_prompts_expanded if actually provided
    // This prevents the backend from misinterpreting empty arrays
    ...(enhancedPromptsExpanded !== undefined ? { enhanced_prompts_expanded: enhancedPromptsExpanded } : {}),
    // NEW: Per-pair parameter overrides (only include if there are actual overrides)
    // Names must match backend expectations: phase_configs_expanded, loras_per_segment_expanded
    // IMPORTANT: Truncate to numSegments to handle deleted images with stale arrays
    ...(params.pair_phase_configs?.some(x => x !== null) ? { phase_configs_expanded: params.pair_phase_configs.slice(0, numSegments) } : {}),
    ...(params.pair_loras?.some(x => x !== null) ? { loras_per_segment_expanded: params.pair_loras.slice(0, numSegments) } : {}),
    ...(params.pair_motion_settings?.some(x => x !== null) ? { motion_settings_expanded: params.pair_motion_settings.slice(0, numSegments) } : {}),
    segment_frames_expanded: segmentFramesExpanded,
    frame_overlap_expanded: frameOverlapExpanded,
    parsed_resolution_wh: finalResolution,
    model_name: params.model_name ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.model_name,
    model_type: params.model_type,
    seed_base: finalSeed,
    // Only include steps if NOT in Advanced Mode (Advanced Mode uses steps_per_phase)
    ...(params.advanced_mode ? {} : { steps: stepsValue }),
    after_first_post_generation_saturation: params.after_first_post_generation_saturation ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.after_first_post_generation_saturation,
    after_first_post_generation_brightness: params.after_first_post_generation_brightness ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.after_first_post_generation_brightness,
    debug_mode_enabled: params.debug ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.debug,
    shot_id: params.shot_id,
    // Include parent_generation_id so complete_task uses it instead of creating a new one
    ...(parentGenerationId ? { parent_generation_id: parentGenerationId } : {}),
    main_output_dir_for_run: params.main_output_dir_for_run ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.main_output_dir_for_run,
    enhance_prompt: params.enhance_prompt ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.enhance_prompt,
    show_input_images: params.show_input_images ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.show_input_images,
    generation_mode: params.generation_mode ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.generation_mode,
    dimension_source: params.dimension_source ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.dimension_source,
    // Only include amount_of_motion if NOT in Advanced Mode
    ...(params.advanced_mode ? {} : { amount_of_motion: params.amount_of_motion ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.amount_of_motion }),
    advanced_mode: params.advanced_mode ?? false,
    // Always set regenerate_anchors to false in Advanced Mode
    ...(params.advanced_mode ? { regenerate_anchors: false } : {}),
    // Include generation_name in orchestrator payload so it flows to child tasks
    generation_name: params.generation_name,
    independent_segments: params.independent_segments ?? true,
    // Text before/after prompts
    ...(params.text_before_prompts ? { text_before_prompts: params.text_before_prompts } : {}),
    ...(params.text_after_prompts ? { text_after_prompts: params.text_after_prompts } : {}),
    // Motion control mode
    ...(params.motion_mode ? { motion_mode: params.motion_mode } : {}),
  };

  const normalizedStructureGuidance = normalizeStructureGuidance({
    structureGuidance: params.structure_guidance,
    structureVideos: params.structure_videos,
    defaultVideoTreatment: DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
    defaultUni3cEndPercent: 0.1,
  });
  if (normalizedStructureGuidance) {
    orchestratorPayload.structure_guidance = normalizedStructureGuidance;
  }

  const additionalLoras = buildAdditionalLorasRecord(params);
  if (additionalLoras) {
    orchestratorPayload.additional_loras = additionalLoras;
  }

  // Add phase_config if provided (for advanced mode)
  if (params.phase_config) {
    orchestratorPayload.phase_config = params.phase_config;
  }

  // Add selected_phase_preset_id if provided (for UI state restoration)
  if (params.selected_phase_preset_id) {
    orchestratorPayload.selected_phase_preset_id = params.selected_phase_preset_id;
  }

  const hasPairIds = Boolean(params.pair_shot_generation_ids?.length);
  const segmentRegenerationMode = hasPairIds
    ? 'segment_regen_from_pair'
    : 'segment_regen_from_order';

  const travelReadContract: TravelBetweenImagesReadContract = {
    contract_version: TASK_FAMILY_CONTRACT_VERSION,
    prompt: params.base_prompt ?? params.base_prompts[0],
    enhanced_prompt: enhancedPromptsExpanded?.[0],
    negative_prompt: params.negative_prompts?.[0],
    model_name: params.model_name ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.model_name,
    resolution: finalResolution,
    enhance_prompt: params.enhance_prompt ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.enhance_prompt,
    motion_mode: params.motion_mode ?? 'basic',
    selected_phase_preset_id: params.selected_phase_preset_id ?? null,
    advanced_mode: params.advanced_mode ?? false,
    amount_of_motion: params.amount_of_motion ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.amount_of_motion,
    phase_config: params.phase_config,
    additional_loras: additionalLoras,
    segment_frames_expanded: segmentFramesExpanded,
    frame_overlap_expanded: frameOverlapExpanded,
    structure_guidance: normalizedStructureGuidance,
  };

  const familyContract = buildTravelBetweenImagesFamilyContract({
    segmentRegenerationMode,
    imageCount: params.image_urls.length,
    segmentCount: numSegments,
    hasPairIds,
    readContract: travelReadContract,
  });

  return composeTaskFamilyPayload({
    taskFamily: 'travel_between_images',
    orchestratorDetails: orchestratorPayload,
    orchestrationInput: {
      taskFamily: 'travel_between_images',
      orchestratorTaskId: taskId,
      runId,
      parentGenerationId,
      shotId: params.shot_id,
      generationRouting: 'orchestrator',
      siblingLookup: 'run_id',
    },
    taskViewInput: {
      inputImages: params.image_urls,
      prompt: params.base_prompt ?? params.base_prompts[0],
      negativePrompt: params.negative_prompts?.[0],
      modelName: params.model_name,
      resolution: finalResolution,
    },
    familyContract,
  });
}
