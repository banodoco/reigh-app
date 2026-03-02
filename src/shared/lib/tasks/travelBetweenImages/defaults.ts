
import { DEFAULT_STEERABLE_MOTION_SETTINGS } from '@/shared/types/steerableMotion';

/**
 * Default values for video structure API params (legacy single-video format)
 */
export const DEFAULT_VIDEO_STRUCTURE_PARAMS: {
  structure_video_treatment: 'adjust' | 'clip';
  structure_video_motion_strength: number;
  structure_video_type: 'uni3c' | 'flow' | 'canny' | 'depth';
} = {
  structure_video_treatment: 'adjust',
  structure_video_motion_strength: 1.2,
  structure_video_type: 'uni3c',  // Hardcoded to uni3c - only supported option now
};

/**
 * Default values for travel between images task settings
 */
export const DEFAULT_TRAVEL_BETWEEN_IMAGES_VALUES = {
  model_name: DEFAULT_STEERABLE_MOTION_SETTINGS.model_name,
  seed: DEFAULT_STEERABLE_MOTION_SETTINGS.seed,
  steps: 20,
  after_first_post_generation_saturation: 1,
  after_first_post_generation_brightness: 0,
  debug: DEFAULT_STEERABLE_MOTION_SETTINGS.debug,
  enhance_prompt: false,
  show_input_images: DEFAULT_STEERABLE_MOTION_SETTINGS.show_input_images,
  generation_mode: "batch" as const,
  dimension_source: "project" as const,
  amount_of_motion: 0.5, // Default to 0.5 (equivalent to UI value of 50)
};
