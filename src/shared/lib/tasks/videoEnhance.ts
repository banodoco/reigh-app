import {
  createTask,
  validateRequiredFields,
  TaskValidationError,
} from "../taskCreation";
import { handleError } from '@/shared/lib/errorHandler';

// ============================================================================
// Video Enhancement API Param Interfaces (Single Source of Truth)
// ============================================================================
// These interfaces define the snake_case params sent to the backend.
// They match the fal.ai API parameters for FILM and FlashVSR.

/**
 * FILM frame interpolation parameters
 * Model: fal-ai/film/video
 */
export interface FilmInterpolationApiParams {
  /** Number of frames to add between each pair of input frames (1-4) */
  num_frames?: number;
  /** Whether to auto-calculate FPS to maintain playback speed */
  use_calculated_fps?: boolean;
  /** Output FPS (only used if use_calculated_fps is false) */
  fps?: number;
  /** Split video into scenes before interpolation */
  use_scene_detection?: boolean;
  /** Create seamless loop */
  loop?: boolean;
  /** Output quality: low, medium, high, maximum */
  video_quality?: 'low' | 'medium' | 'high' | 'maximum';
  /** Write mode: fast, balanced, small */
  video_write_mode?: 'fast' | 'balanced' | 'small';
}

/**
 * FlashVSR video upscaling parameters
 * Model: fal-ai/flashvsr/upscale/video
 */
export interface FlashVsrUpscaleApiParams {
  /** Scaling multiplier (1-4) */
  upscale_factor?: number;
  /** VAE decoding mode: regular (quality), high (balanced), full (fastest) */
  acceleration?: 'regular' | 'high' | 'full';
  /** Tile blending quality (0-100) */
  quality?: number;
  /** Enable color correction */
  color_fix?: boolean;
  /** Output format */
  output_format?: 'X264 (.mp4)' | 'VP9 (.webm)' | 'PRORES4444 (.mov)' | 'GIF';
  /** Output quality: low, medium, high, maximum */
  output_quality?: 'low' | 'medium' | 'high' | 'maximum';
  /** Write mode: fast, balanced, small */
  output_write_mode?: 'fast' | 'balanced' | 'small';
  /** Preserve original audio */
  preserve_audio?: boolean;
}

/**
 * Default values for FILM interpolation
 */
export const DEFAULT_FILM_PARAMS: Required<Pick<
  FilmInterpolationApiParams,
  'num_frames' | 'use_calculated_fps' | 'video_quality'
>> = {
  num_frames: 1,
  use_calculated_fps: true,
  video_quality: 'high',
};

/**
 * Default values for FlashVSR upscaling
 */
export const DEFAULT_FLASHVSR_PARAMS: Required<Pick<
  FlashVsrUpscaleApiParams,
  'upscale_factor' | 'color_fix' | 'output_quality'
>> = {
  upscale_factor: 2,
  color_fix: true,
  output_quality: 'high',
};

/**
 * Combined video enhancement task parameters
 */
export interface VideoEnhanceTaskParams {
  // Required
  project_id: string;
  video_url: string;

  // Mode selection - at least one must be true
  enable_interpolation: boolean;
  enable_upscale: boolean;

  // FILM interpolation params (used when enable_interpolation is true)
  interpolation?: FilmInterpolationApiParams;

  // FlashVSR upscale params (used when enable_upscale is true)
  upscale?: FlashVsrUpscaleApiParams;

  // Task metadata
  shot_id?: string;
  /** Generation ID this enhancement is based on - creates variant when set */
  based_on?: string;
  /** Source variant ID - track which variant was enhanced */
  source_variant_id?: string;
}

/**
 * Validates video enhancement task parameters
 */
function validateVideoEnhanceParams(params: VideoEnhanceTaskParams): void {
  validateRequiredFields(params, ['project_id', 'video_url']);

  if (!params.enable_interpolation && !params.enable_upscale) {
    throw new TaskValidationError(
      "At least one enhancement mode (interpolation or upscale) must be enabled",
      'enable_interpolation'
    );
  }

  // Validate interpolation params if enabled
  if (params.enable_interpolation && params.interpolation?.num_frames !== undefined) {
    if (params.interpolation.num_frames < 1 || params.interpolation.num_frames > 4) {
      throw new TaskValidationError(
        "num_frames must be between 1 and 4",
        'interpolation.num_frames'
      );
    }
  }

  // Validate upscale params if enabled
  if (params.enable_upscale && params.upscale?.upscale_factor !== undefined) {
    if (params.upscale.upscale_factor < 1 || params.upscale.upscale_factor > 4) {
      throw new TaskValidationError(
        "upscale_factor must be between 1 and 4",
        'upscale.upscale_factor'
      );
    }
  }
}

/**
 * Builds the task payload for video enhancement
 */
function buildVideoEnhancePayload(
  params: VideoEnhanceTaskParams
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    video_url: params.video_url,
    enable_interpolation: params.enable_interpolation,
    enable_upscale: params.enable_upscale,
  };

  // Add interpolation params with defaults
  if (params.enable_interpolation) {
    payload.interpolation = {
      num_frames: params.interpolation?.num_frames ?? DEFAULT_FILM_PARAMS.num_frames,
      use_calculated_fps: params.interpolation?.use_calculated_fps ?? DEFAULT_FILM_PARAMS.use_calculated_fps,
      video_quality: params.interpolation?.video_quality ?? DEFAULT_FILM_PARAMS.video_quality,
      // Optional params only if provided
      ...(params.interpolation?.use_scene_detection !== undefined && {
        use_scene_detection: params.interpolation.use_scene_detection,
      }),
      ...(params.interpolation?.loop !== undefined && {
        loop: params.interpolation.loop,
      }),
    };
  }

  // Add upscale params with defaults
  if (params.enable_upscale) {
    payload.upscale = {
      upscale_factor: params.upscale?.upscale_factor ?? DEFAULT_FLASHVSR_PARAMS.upscale_factor,
      color_fix: params.upscale?.color_fix ?? DEFAULT_FLASHVSR_PARAMS.color_fix,
      output_quality: params.upscale?.output_quality ?? DEFAULT_FLASHVSR_PARAMS.output_quality,
      // Optional params only if provided
      ...(params.upscale?.quality !== undefined && {
        quality: params.upscale.quality,
      }),
      ...(params.upscale?.acceleration !== undefined && {
        acceleration: params.upscale.acceleration,
      }),
    };
  }

  // Add metadata
  if (params.shot_id) {
    payload.shot_id = params.shot_id;
  }
  // based_on tells complete_task to create a variant on the source generation
  if (params.based_on) {
    payload.based_on = params.based_on;
  }
  // source_variant_id tracks which variant was enhanced (for UI display)
  if (params.source_variant_id) {
    payload.source_variant_id = params.source_variant_id;
  }

  return payload;
}

/**
 * Result of creating a video enhancement task
 */
export interface VideoEnhanceTaskResult {
  task: any;
}

/**
 * Creates a video enhancement task
 *
 * @param params - Video enhancement task parameters
 * @returns Promise resolving to the created task
 */
export async function createVideoEnhanceTask(
  params: VideoEnhanceTaskParams
): Promise<VideoEnhanceTaskResult> {
  console.log("[createVideoEnhanceTask] Creating task with params:", {
    video_url: params.video_url?.substring(0, 50) + '...',
    enable_interpolation: params.enable_interpolation,
    enable_upscale: params.enable_upscale,
  });

  try {
    // 1. Validate parameters
    validateVideoEnhanceParams(params);

    // 2. Build task payload
    const payload = buildVideoEnhancePayload(params);

    // 3. Create task using unified create-task function
    const result = await createTask({
      project_id: params.project_id,
      task_type: 'video_enhance',
      params: {
        tool_type: 'video-enhance',
        ...payload,
      },
    });

    console.log("[createVideoEnhanceTask] Task created successfully:", result);
    return { task: result };

  } catch (error) {
    handleError(error, { context: 'VideoEnhance', showToast: false });
    throw error;
  }
}

/**
 * Re-export for convenience
 */
export { TaskValidationError } from "../taskCreation";
