/** Shared settings contracts for travel-between-images motion configuration. */

export interface SteerableMotionSettings {
  negative_prompt: string;
  model_name: string;
  seed: number;
  debug: boolean;
  show_input_images: boolean;
}

export const DEFAULT_STEERABLE_MOTION_SETTINGS: SteerableMotionSettings = {
  negative_prompt: '',
  model_name: 'wan_2_2_i2v_lightning_baseline_2_2_2',
  seed: 789,
  debug: false,
  show_input_images: false,
};

/** Per-shot gallery UI settings. */
export interface GenerationsPaneSettings {
  selectedShotFilter: string;
  excludePositioned: boolean;
  // Flag to track if user has manually changed settings (never auto-reset after this)
  userHasCustomized?: boolean;
}
