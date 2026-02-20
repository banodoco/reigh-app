import {
  expandArrayToCount,
  validateRequiredFields,
  TaskValidationError,
  safeParseJson,
} from "../../taskCreation";
import type { TravelBetweenImagesTaskParams } from './types';
import {
  DEFAULT_VIDEO_STRUCTURE_PARAMS,
  DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES,
} from './defaults';

/**
 * Validates travel between images task parameters
 *
 * @param params - Parameters to validate
 * @throws TaskValidationError if validation fails
 */
export function validateTravelBetweenImagesParams(params: TravelBetweenImagesTaskParams): void {
  validateRequiredFields(params as unknown as Record<string, unknown>, [
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
  params: TravelBetweenImagesTaskParams,
  finalResolution: string,
  taskId: string,
  runId: string,
  parentGenerationId?: string
): Record<string, unknown> {
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
      const parsedParams = safeParseJson(params.params_json_str, {} as Record<string, unknown>);
      const parsedSteps = (parsedParams as Record<string, unknown>)?.steps;
      if (typeof parsedSteps === 'number') {
        stepsValue = parsedSteps;
      }
    }
    if (stepsValue === undefined) {
      stepsValue = DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.steps;
    }
  }

  // Handle random seed generation - if random_seed is true, generate a new random seed
  // Otherwise use the provided seed or default
  const finalSeed = params.random_seed
    ? Math.floor(Math.random() * 1000000)
    : (params.seed ?? DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES.seed);

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
    shot_id: params.shot_id ?? undefined,
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
    generation_name: params.generation_name ?? undefined,
    independent_segments: params.independent_segments ?? true,
    // Text before/after prompts
    ...(params.text_before_prompts ? { text_before_prompts: params.text_before_prompts } : {}),
    ...(params.text_after_prompts ? { text_after_prompts: params.text_after_prompts } : {}),
    // Motion control mode
    ...(params.motion_mode ? { motion_mode: params.motion_mode } : {}),
    // HARDCODED: SVI (smooth continuations) feature has been removed from UX
    // Always set to false regardless of any params passed
    use_svi: false,
  };

  // ============================================================================
  // STRUCTURE GUIDANCE - NEW UNIFIED FORMAT (videos INSIDE structure_guidance)
  // ============================================================================
  // The unified format nests videos inside structure_guidance:
  // {
  //   "structure_guidance": {
  //     "target": "uni3c" | "vace",
  //     "videos": [{ path, start_frame, end_frame, treatment }],
  //     "strength": 1.0,
  //     // Uni3C: step_window, frame_policy, zero_empty_frames
  //     // VACE: preprocessing, canny_intensity, depth_contrast
  //   }
  // }
  // NO SEPARATE structure_videos array - everything is in structure_guidance.

  if (params.structure_guidance) {
    // New unified format - structure_guidance contains videos inside
    orchestratorPayload.structure_guidance = params.structure_guidance;
  } else if (params.structure_videos && params.structure_videos.length > 0) {
    // LEGACY: Separate structure_videos array - convert to unified format
    // Clean the array to only include backend-relevant fields
    const cleanedVideos = params.structure_videos.map(video => ({
      path: video.path,
      start_frame: video.start_frame ?? 0,
      end_frame: video.end_frame ?? null,
      treatment: video.treatment ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
    }));

    // Build unified structure_guidance from the first video's settings
    const firstVideo = params.structure_videos[0];
    const firstVideoRecord = firstVideo as unknown as Record<string, unknown>;
    const isUni3cTarget = firstVideoRecord.structure_type === 'uni3c';

    const unifiedGuidance: Record<string, unknown> = {
      target: isUni3cTarget ? 'uni3c' : 'vace',
      videos: cleanedVideos,
      strength: firstVideoRecord.motion_strength ?? 1.0,
    };

    if (isUni3cTarget) {
      unifiedGuidance.step_window = [
        firstVideoRecord.uni3c_start_percent ?? 0,
        firstVideoRecord.uni3c_end_percent ?? 1.0,
      ];
      unifiedGuidance.frame_policy = 'fit';
      unifiedGuidance.zero_empty_frames = true;
    } else {
      const preprocessingMap: Record<string, string> = {
        'flow': 'flow', 'canny': 'canny', 'depth': 'depth', 'raw': 'none',
      };
      unifiedGuidance.preprocessing = preprocessingMap[(firstVideoRecord.structure_type as string) ?? 'flow'] ?? 'flow';
    }

    orchestratorPayload.structure_guidance = unifiedGuidance;

  } else if (params.structure_video_path) {
    // LEGACY: Single video path - convert to unified format
    const isUni3cTarget = params.structure_video_type === 'uni3c' || params.use_uni3c;

    const unifiedGuidance: Record<string, unknown> = {
      target: isUni3cTarget ? 'uni3c' : 'vace',
      videos: [{
        path: params.structure_video_path,
        start_frame: 0,
        end_frame: null,
        treatment: params.structure_video_treatment ?? DEFAULT_VIDEO_STRUCTURE_PARAMS.structure_video_treatment,
      }],
      strength: params.structure_video_motion_strength ?? 1.0,
    };

    if (isUni3cTarget) {
      unifiedGuidance.step_window = [
        params.uni3c_start_percent ?? 0,
        params.uni3c_end_percent ?? 0.1,
      ];
      unifiedGuidance.frame_policy = 'fit';
      unifiedGuidance.zero_empty_frames = true;
    } else {
      const preprocessingMap: Record<string, string> = {
        'flow': 'flow', 'canny': 'canny', 'depth': 'depth', 'raw': 'none',
      };
      unifiedGuidance.preprocessing = preprocessingMap[params.structure_video_type ?? 'flow'] ?? 'flow';
    }

    orchestratorPayload.structure_guidance = unifiedGuidance;

  }

  // Attach additional_loras mapping if provided (matching original logic)
  if (params.loras && params.loras.length > 0) {
    const additionalLoras: Record<string, number> = params.loras.reduce<Record<string, number>>((acc, lora) => {
      acc[lora.path] = lora.strength;
      return acc;
    }, {});
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

  // CLEANUP: Remove legacy structure video params that are now replaced by unified structure_guidance
  // These may have been passed in params and are no longer needed in the output
  const legacyStructureParams = [
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
  ];
  for (const param of legacyStructureParams) {
    delete (orchestratorPayload as Record<string, unknown>)[param];
  }

  return orchestratorPayload;
}
