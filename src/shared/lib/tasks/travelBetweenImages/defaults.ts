
import { DEFAULT_STEERABLE_MOTION_SETTINGS } from '@/shared/types/steerableMotion';

/**
 * Canonical defaults for structure guidance controls.
 */
export const DEFAULT_STRUCTURE_GUIDANCE_CONTROLS = {
  motionStrength: 1.2,
  structureType: 'uni3c' as const,
  uni3cEndPercent: 0.1,
};

/**
 * Canonical defaults for structure video entries.
 */
export const DEFAULT_STRUCTURE_VIDEO = {
  treatment: 'adjust' as const,
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
  generation_mode: 'batch' as const,
  dimension_source: 'project' as const,
  amount_of_motion: 0.5, // Default to 0.5 (equivalent to UI value of 50)
};
