import { PhaseConfig } from '@/shared/types/phaseConfig';
import type { PathLoraConfig } from '@/shared/types/lora';

/**
 * Unified structure guidance contract for vace/uni3c.
 */
export interface StructureGuidanceConfig {
  /** Target system for guidance. */
  target: 'vace' | 'uni3c';

  /**
   * Preprocessing method (VACE only).
   * `none` maps legacy `raw` behavior.
   */
  preprocessing?: 'flow' | 'canny' | 'depth' | 'none';

  /** Unified strength parameter. */
  strength?: number;

  /** VACE-specific: canny edge detection intensity. */
  canny_intensity?: number;

  /** VACE-specific: depth contrast. */
  depth_contrast?: number;

  /** Uni3C-specific step window as [start_percent, end_percent]. */
  step_window?: [number, number];

  /** Uni3C-specific frame policy. */
  frame_policy?: 'fit' | 'clip';

  /** Uni3C-specific: zero out empty frames. */
  zero_empty_frames?: boolean;
}

/**
 * Single structure video mapping entry.
 * Frame ranges are half-open: `start_frame` inclusive, `end_frame` exclusive.
 */
export interface StructureVideoConfig {
  /** Path to structure video (S3/Storage URL). */
  path: string;

  /** Where in output timeline this video starts guiding (inclusive). */
  start_frame: number;

  /** Where in output timeline this video ends (exclusive). */
  end_frame: number;

  /**
   * Source/output frame mismatch policy.
   * `adjust` resamples to fit; `clip` applies 1:1 mapping.
   */
  treatment?: 'adjust' | 'clip';

  /** Optional source start frame (inclusive). */
  source_start_frame?: number;

  /** Optional source end frame (exclusive). */
  source_end_frame?: number | null;
}

/**
 * Motion control parameters for video generation.
 * Controls the amount and type of motion in generated videos.
 */
export interface VideoMotionApiParams {
  /** Amount of motion: 0.0 = static, 1.0 = maximum motion (UI slider is 0-100, divide by 100) */
  amount_of_motion?: number;
  /** Motion control mode for UI state */
  motion_mode?: 'basic' | 'presets' | 'advanced';
  /** Whether using advanced phase configuration */
  advanced_mode?: boolean;
  /** Advanced phase configuration for multi-phase generation */
  phase_config?: PhaseConfig;
  /** Selected phase preset ID for UI state restoration */
  selected_phase_preset_id?: string | null;
}

/**
 * Model and generation settings for video tasks.
 */
export interface VideoModelApiParams {
  /** Model name/identifier */
  model_name?: string;
  /** Model type: i2v (image-to-video) or vace (video-guided) */
  model_type?: 'i2v' | 'vace';
  /** Random seed for reproducibility */
  seed?: number;
  /** Number of inference steps (when not using phase_config) */
  steps?: number;
  /** Whether to use a random seed */
  random_seed?: boolean;
  /** Enable turbo/fast generation mode */
  turbo_mode?: boolean;
  /** Enable debug output */
  debug?: boolean;
}

/**
 * Prompt-related parameters for video generation.
 */
export interface VideoPromptApiParams {
  /** Default/base prompt used for all segments */
  base_prompt?: string;
  /** Per-segment prompts (overrides base_prompt when non-empty) */
  base_prompts?: string[];
  /** Negative prompts per segment */
  negative_prompts?: string[];
  /** AI-enhanced prompts per segment */
  enhanced_prompts?: string[];
  /** Whether to enable AI prompt enhancement */
  enhance_prompt?: boolean;
  /** Text prepended to all prompts */
  text_before_prompts?: string;
  /** Text appended to all prompts */
  text_after_prompts?: string;
}

/**
 * UI-controlled prompt configuration for video generation.
 * Uses snake_case to match API params directly - no conversion needed.
 *
 * Note: Array fields (base_prompts, negative_prompts, enhanced_prompts) are
 * computed from database in generateVideoService, not passed from UI.
 */
export interface PromptConfig {
  /** Default/base prompt used for all segments */
  base_prompt: string;
  /** Whether to enable AI prompt enhancement */
  enhance_prompt: boolean;
  /** Text prepended to all prompts (optional) */
  text_before_prompts?: string;
  /** Text appended to all prompts (optional) */
  text_after_prompts?: string;
  /** Default negative prompt (used as fallback for negative_prompts array) */
  default_negative_prompt: string;
}

/**
 * UI-controlled motion configuration for video generation.
 * Uses snake_case to match API params directly - no conversion needed.
 */
export interface MotionConfig {
  /** Amount of motion: 0-100 (divided by 100 before sending to API) */
  amount_of_motion: number;
  /** Motion control mode for UI */
  motion_mode: 'basic' | 'presets' | 'advanced';
  /** Whether using advanced phase configuration */
  advanced_mode: boolean;
  /** Advanced phase configuration for multi-phase generation */
  phase_config?: PhaseConfig;
  /** Selected phase preset ID for UI state restoration */
  selected_phase_preset_id?: string;
}

/**
 * UI-controlled model/generation configuration for video generation.
 * Uses snake_case to match API params directly - no conversion needed.
 */
export interface ModelConfig {
  /** Random seed for reproducibility */
  seed: number;
  /** Whether to use a random seed each generation */
  random_seed: boolean;
  /** Enable turbo/fast generation mode */
  turbo_mode: boolean;
  /** Enable debug output */
  debug: boolean;
  /** Generation type mode: i2v (image-to-video) or vace (video-guided) */
  generation_type_mode: 'i2v' | 'vace';
}

/**
 * Strict API request payload for travel-between-images task creation.
 * This contract intentionally excludes UI-only fields and migration-only aliases.
 */
export interface TravelBetweenImagesRequestPayload {
  // Required fields
  project_id: string;
  image_urls: string[];
  base_prompts: string[];
  segment_frames: number[];
  frame_overlap: number[];

  // Prompt controls
  base_prompt?: string;
  negative_prompts?: string[];
  enhanced_prompts?: string[];
  enhance_prompt?: boolean;
  text_before_prompts?: string;
  text_after_prompts?: string;

  // Motion controls
  amount_of_motion?: number;
  motion_mode?: 'basic' | 'presets' | 'advanced';
  advanced_mode?: boolean;
  phase_config?: PhaseConfig;
  selected_phase_preset_id?: string | null;

  // Model/runtime controls
  model_name?: string;
  model_type?: 'i2v' | 'vace';
  seed?: number;
  steps?: number;
  random_seed?: boolean;
  turbo_mode?: boolean;
  debug?: boolean;

  // Task metadata
  shot_id?: string;
  parent_generation_id?: string;
  image_generation_ids?: string[];
  image_variant_ids?: string[];
  pair_shot_generation_ids?: string[];
  resolution?: string;
  params_json_str?: string;
  main_output_dir_for_run?: string;
  openai_api_key?: string;
  show_input_images?: boolean;
  generation_mode?: 'batch' | 'timeline' | 'by-pair';
  dimension_source?: 'project' | 'firstImage' | 'custom';
  regenerate_anchors?: boolean;
  after_first_post_generation_saturation?: number;
  after_first_post_generation_brightness?: number;
  generation_name?: string;
  independent_segments?: boolean;
  chain_segments?: boolean;

  // ============================================================================
  // PER-PAIR PARAMETER OVERRIDES
  // ============================================================================
  // These arrays allow per-segment customization of generation parameters.
  // null = use shot default, explicit value = use per-pair override.
  // Array length should match number of pairs (image_urls.length - 1).

  /** Per-pair phase config overrides (null = use shot default) */
  pair_phase_configs?: (PhaseConfig | null)[];

  /** Per-pair LoRA overrides (null = use shot default) */
  pair_loras?: (PathLoraConfig[] | null)[];

  /** Global LoRA overrides (expanded by the payload builder when needed). */
  loras?: PathLoraConfig[];

  /** Per-pair motion settings overrides (null = use shot default) */
  pair_motion_settings?: (Record<string, unknown> | null)[];

  // ============================================================================
  // NEW UNIFIED STRUCTURE GUIDANCE FORMAT
  // ============================================================================

  // Structure guidance
  structure_guidance?: StructureGuidanceConfig;
  structure_videos?: StructureVideoConfig[];

  // ============================================================================
  // STITCH CONFIG (for automatic join after generation)
  // ============================================================================

  /**
   * When provided, the orchestrator will create a join_final_stitch task
   * after all travel segments complete. This task will stitch the generated
   * clips together using the provided join settings.
   */
  stitch_config?: StitchConfig;
}

/**
 * Canonical create-task input for travel-between-images.
 * Legacy structure aliases should be translated in adapters before reaching this type.
 */
export type TravelBetweenImagesTaskInput = TravelBetweenImagesRequestPayload;


/**
 * Configuration for automatic stitching after travel generation.
 * Contains ALL settings needed by the worker to create join tasks independently.
 * This is a self-contained config - does not inherit from travel generation params.
 *
 * Fields match the explicit join-clips task inputs to ensure the worker has
 * everything needed without depending on mixed legacy+modern parameter bags.
 */
export interface StitchConfig {
  // === Frame settings ===
  /** Number of context frames to use from each clip end */
  context_frame_count: number;
  /** Number of gap frames to generate between clips */
  gap_frame_count: number;
  /** Replace frames (true) or generate new frames (false) */
  replace_mode: boolean;
  /** Keep the bridging/anchor images in output */
  keep_bridging_images: boolean;

  // === Prompt settings ===
  /** Prompt for join generation */
  prompt: string;
  /** Negative prompt */
  negative_prompt: string;
  /** Whether to enhance prompts with AI */
  enhance_prompt: boolean;

  // === Model settings (independent from travel generation) ===
  /** Model to use for join generation */
  model: string;
  /** Number of inference steps */
  num_inference_steps: number;
  /** Guidance scale */
  guidance_scale: number;
  /** Seed value (-1 for random) */
  seed: number;
  /** Whether to use random seed */
  random_seed: boolean;

  // === Motion settings ===
  /** Motion mode: 'basic' (LoRAs) or 'advanced' (phase config) */
  motion_mode: 'basic' | 'advanced';
  /** Phase config for motion control */
  phase_config?: PhaseConfig;
  /** Selected phase preset ID for UI state restoration */
  selected_phase_preset_id?: string | null;
  /** LoRAs for join generation */
  loras?: PathLoraConfig[];

  // === Optional settings with defaults ===
  /** Task priority (default 0) */
  priority?: number;
  /** Use first input video's resolution instead of project resolution */
  use_input_video_resolution?: boolean;
  /** Use first input video's FPS instead of downsampling */
  use_input_video_fps?: boolean;
  /** Vid2vid init strength - adds noise to input video (0 = disabled) */
  vid2vid_init_strength?: number;
  /** Loop first clip - use first clip as both start and end */
  loop_first_clip?: boolean;
}

/**
 * Result of creating a travel between images task
 */
export interface TravelBetweenImagesTaskResult {
  /** The created task data */
  task: import("../../taskCreation").TaskCreationResult;
  /** The parent generation ID (either provided or newly created) */
  parentGenerationId: string | undefined;
}
