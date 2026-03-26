import type { ResolverResult, TaskFamilyResolver, TaskInsertObject } from "./types.ts";
import {
  validateRequiredFields,
  validateUrlString,
  TaskValidationError,
} from "./shared/validation.ts";

interface FilmInterpolationApiParams {
  num_frames?: number;
  use_calculated_fps?: boolean;
  fps?: number;
  use_scene_detection?: boolean;
  loop?: boolean;
  video_quality?: "low" | "medium" | "high" | "maximum";
  video_write_mode?: "fast" | "balanced" | "small";
}

interface FlashVsrUpscaleApiParams {
  upscale_factor?: number;
  acceleration?: "regular" | "high" | "full";
  quality?: number;
  color_fix?: boolean;
  output_format?: "X264 (.mp4)" | "VP9 (.webm)" | "PRORES4444 (.mov)" | "GIF";
  output_quality?: "low" | "medium" | "high" | "maximum";
  output_write_mode?: "fast" | "balanced" | "small";
  preserve_audio?: boolean;
}

interface VideoEnhanceTaskInput {
  video_url: string;
  enable_interpolation: boolean;
  enable_upscale: boolean;
  interpolation?: FilmInterpolationApiParams;
  upscale?: FlashVsrUpscaleApiParams;
  shot_id?: string;
  based_on?: string;
  source_variant_id?: string;
}

const DEFAULT_FILM_PARAMS = {
  num_frames: 1,
  use_calculated_fps: true,
  video_quality: "high",
} as const;

const DEFAULT_FLASHVSR_PARAMS = {
  upscale_factor: 2,
  color_fix: true,
  output_quality: "high",
} as const;

function buildQueuedTask(
  projectId: string,
  taskType: string,
  params: Record<string, unknown>,
): TaskInsertObject {
  return {
    project_id: projectId,
    task_type: taskType,
    params,
    status: "Queued",
    created_at: new Date().toISOString(),
    dependant_on: null,
  };
}

function validateVideoEnhanceInput(input: VideoEnhanceTaskInput): void {
  validateRequiredFields(input, ["video_url"]);
  validateUrlString(input.video_url, "video_url", "Video URL");

  if (!input.enable_interpolation && !input.enable_upscale) {
    throw new TaskValidationError(
      "At least one enhancement mode (interpolation or upscale) must be enabled",
      "enable_interpolation",
    );
  }

  if (
    input.enable_interpolation
    && input.interpolation?.num_frames !== undefined
    && (input.interpolation.num_frames < 1 || input.interpolation.num_frames > 4)
  ) {
    throw new TaskValidationError("num_frames must be between 1 and 4", "interpolation.num_frames");
  }

  if (
    input.enable_upscale
    && input.upscale?.upscale_factor !== undefined
    && (input.upscale.upscale_factor < 1 || input.upscale.upscale_factor > 4)
  ) {
    throw new TaskValidationError("upscale_factor must be between 1 and 4", "upscale.upscale_factor");
  }
}

function buildVideoEnhancePayload(input: VideoEnhanceTaskInput): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    tool_type: "video-enhance",
    video_url: input.video_url,
    enable_interpolation: input.enable_interpolation,
    enable_upscale: input.enable_upscale,
  };

  if (input.enable_interpolation) {
    payload.interpolation = {
      num_frames: input.interpolation?.num_frames ?? DEFAULT_FILM_PARAMS.num_frames,
      use_calculated_fps: input.interpolation?.use_calculated_fps ?? DEFAULT_FILM_PARAMS.use_calculated_fps,
      video_quality: input.interpolation?.video_quality ?? DEFAULT_FILM_PARAMS.video_quality,
      ...(input.interpolation?.use_scene_detection !== undefined
        ? { use_scene_detection: input.interpolation.use_scene_detection }
        : {}),
      ...(input.interpolation?.loop !== undefined ? { loop: input.interpolation.loop } : {}),
      ...(input.interpolation?.fps !== undefined ? { fps: input.interpolation.fps } : {}),
      ...(input.interpolation?.video_write_mode !== undefined
        ? { video_write_mode: input.interpolation.video_write_mode }
        : {}),
    };
  }

  if (input.enable_upscale) {
    payload.upscale = {
      upscale_factor: input.upscale?.upscale_factor ?? DEFAULT_FLASHVSR_PARAMS.upscale_factor,
      color_fix: input.upscale?.color_fix ?? DEFAULT_FLASHVSR_PARAMS.color_fix,
      output_quality: input.upscale?.output_quality ?? DEFAULT_FLASHVSR_PARAMS.output_quality,
      ...(input.upscale?.quality !== undefined ? { quality: input.upscale.quality } : {}),
      ...(input.upscale?.acceleration !== undefined ? { acceleration: input.upscale.acceleration } : {}),
      ...(input.upscale?.output_format !== undefined ? { output_format: input.upscale.output_format } : {}),
      ...(input.upscale?.output_write_mode !== undefined
        ? { output_write_mode: input.upscale.output_write_mode }
        : {}),
      ...(input.upscale?.preserve_audio !== undefined
        ? { preserve_audio: input.upscale.preserve_audio }
        : {}),
    };
  }

  if (input.shot_id) {
    payload.shot_id = input.shot_id;
  }
  if (input.based_on) {
    payload.based_on = input.based_on;
    payload.parent_generation_id = input.based_on;
    payload.is_primary = true;
  }
  if (input.source_variant_id) {
    payload.source_variant_id = input.source_variant_id;
  }

  return payload;
}

export const videoEnhanceResolver: TaskFamilyResolver = (request, context): ResolverResult => {
  const input = request.input as unknown as VideoEnhanceTaskInput;
  validateVideoEnhanceInput(input);

  return {
    tasks: [
      buildQueuedTask(
        context.projectId,
        "video_enhance",
        buildVideoEnhancePayload(input),
      ),
    ],
  };
};

export {
  DEFAULT_FILM_PARAMS,
  DEFAULT_FLASHVSR_PARAMS,
};
