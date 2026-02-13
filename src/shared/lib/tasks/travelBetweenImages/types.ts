import { PhaseConfig } from '@/shared/types/phaseConfig';
import type { PathLoraConfig } from '@/shared/types/lora';

// ============================================================================
// Video Generation API Param Interfaces (Single Source of Truth)
// ============================================================================
// These interfaces define the snake_case params sent to the backend.
// UI code should re-export these types and use them when building task params.

// ============================================================================
// NEW UNIFIED STRUCTURE GUIDANCE FORMAT
// ============================================================================

/**
 * Unified structure guidance configuration.
 * This is the new format that combines VACE and Uni3C configuration into a single object.
 *
 * Example VACE with flow:
 * ```
 * {
 *   target: "vace",
 *   preprocessing: "flow",
 *   strength: 1.2,
 * }
 * ```
 *
 * Example Uni3C:
 * ```
 * {
 *   target: "uni3c",
 *   strength: 0.8,
 *   step_window: [0.1, 0.9],
 * }
 * ```
 */
export interface StructureGuidanceConfig {
  /** Target system for guidance: "vace" for VACE model, "uni3c" for I2V with guidance */
  target: 'vace' | 'uni3c';

  /**
   * Preprocessing method (VACE only):
   * - "flow": optical flow extraction
   * - "canny": edge detection
   * - "depth": depth estimation
   * - "none": use raw frames (equivalent to old "raw" structure_type)
   */
  preprocessing?: 'flow' | 'canny' | 'depth' | 'none';

  /** Unified strength parameter (works for both VACE and Uni3C). Default: 1.0 */
  strength?: number;

  /** VACE-specific: canny edge detection intensity. Default: 1.0 */
  canny_intensity?: number;

  /** VACE-specific: depth contrast. Default: 1.0 */
  depth_contrast?: number;

  /**
   * Uni3C-specific: step window as [start_percent, end_percent].
   * Controls when during inference uni3c guidance is applied.
   * Default: [0.0, 1.0]
   */
  step_window?: [number, number];

  /** Uni3C-specific: frame policy. Default: "fit" */
  frame_policy?: 'fit' | 'clip';

  /** Uni3C-specific: zero out empty frames. Default: true */
  zero_empty_frames?: boolean;
}

/**
 * Single structure video configuration within the structure_videos array.
 * Defines which OUTPUT timeline frames this video guides and which SOURCE frames to use.
 *
 * NOTE: In the new unified format, structure_type and strength params moved to
 * the separate `structure_guidance` config object. This now only contains
 * the video source and frame mapping info.
 *
 * Frame ranges are half-open: start_frame inclusive, end_frame exclusive.
 * Example: start_frame=0, end_frame=81 covers frames 0-80 (81 frames total).
 */
export interface StructureVideoConfig {
  /** Path to structure video (S3/Storage URL) - REQUIRED */
  path: string;

  /** Where in OUTPUT timeline this video starts guiding (inclusive, 0-based) */
  start_frame: number;

  /** Where in OUTPUT timeline this video ends (exclusive) */
  end_frame: number;

  /**
   * How to handle frame count mismatches between SOURCE range and OUTPUT range:
   * - "adjust": resample (stretch/compress) SOURCE frames to exactly fill output range
   * - "clip": 1:1 mapping; if source shorter, remaining output frames are unguided;
   *           if source longer, extra source frames are ignored.
   * Default: "adjust"
   */
  treatment?: 'adjust' | 'clip';

  /**
   * Optional: Start frame within SOURCE video (inclusive, 0-based).
   * Default: 0
   */
  source_start_frame?: number;

  /**
   * Optional: End frame within SOURCE video (exclusive).
   * Default: null (meaning end of video)
   */
  source_end_frame?: number | null;

  // ============================================================================
  // LEGACY FIELDS (kept for backward compatibility, prefer structure_guidance)
  // ============================================================================

  /** @deprecated Use structure_guidance.strength instead */
  motion_strength?: number;

  /** @deprecated Use structure_guidance.target + preprocessing instead */
  structure_type?: 'uni3c' | 'flow' | 'canny' | 'depth';

  /** @deprecated Use structure_guidance.step_window[0] instead */
  uni3c_start_percent?: number;

  /** @deprecated Use structure_guidance.step_window[1] instead */
  uni3c_end_percent?: number;
}

/**
 * Extended structure video config with UI-only fields (not sent to backend).
 * Used for local state management in useStructureVideo hook.
 */
export interface StructureVideoConfigWithMetadata extends StructureVideoConfig {
  /** Video metadata (UI only - not sent to backend) */
  metadata?: import('@/shared/lib/videoUploader').VideoMetadata | null;

  /** Resource ID tracking (UI only - not sent to backend) */
  resource_id?: string | null;
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
  /** Enable smooth video interpolation (SVI) for smoother transitions */
  use_svi?: boolean;
}

/**
 * Interface for travel between images (steerable motion) task parameters.
 * Extends from shared API param interfaces for consistent typing.
 * This matches the original steerable-motion edge function request body.
 */
export interface TravelBetweenImagesTaskParams extends
  Partial<VideoMotionApiParams>,
  Partial<VideoModelApiParams>,
  Partial<VideoPromptApiParams> {
  // Required fields (override Partial<> for fields that must be present)
  project_id: string;
  image_urls: string[];
  base_prompts: string[]; // Required - per-segment prompts
  segment_frames: number[];
  frame_overlap: number[];

  // Optional task-specific fields (not in shared interfaces)
  shot_id?: string;
  /** Parent generation ID - if not provided, one will be created */
  parent_generation_id?: string;
  /** Generation IDs corresponding to image_urls (for clickable images in SegmentCard) */
  image_generation_ids?: string[];
  /**
   * NEW: Stable IDs for tethering segment videos to timeline pairs.
   * For N images, this should be N-1 IDs: the `shot_generations.id` of each pair's START image.
   */
  pair_shot_generation_ids?: string[];
  resolution?: string;
  params_json_str?: string;
  main_output_dir_for_run?: string;
  openai_api_key?: string;
  /** Legacy LoRA format - prefer phase_config.phases[].loras */
  loras?: PathLoraConfig[];
  show_input_images?: boolean;
  generation_mode?: 'batch' | 'timeline' | 'by-pair';
  dimension_source?: 'project' | 'firstImage' | 'custom';
  /** Whether to regenerate anchor images (Advanced Mode only) */
  regenerate_anchors?: boolean;
  /** Saturation adjustment (1.0 = no change) */
  after_first_post_generation_saturation?: number;
  /** Brightness adjustment (0 = no change) */
  after_first_post_generation_brightness?: number;
  /** Optional variant name for the generation */
  generation_name?: string;
  /** Whether segments are generated independently */
  independent_segments?: boolean;
  /** Enable smooth video interpolation (SVI) for smoother transitions */
  use_svi?: boolean;

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

  /** Per-pair motion settings overrides (null = use shot default) */
  pair_motion_settings?: (Record<string, unknown> | null)[];

  // ============================================================================
  // NEW UNIFIED STRUCTURE GUIDANCE FORMAT
  // ============================================================================

  /**
   * NEW: Unified structure guidance configuration.
   * Contains target (vace/uni3c), preprocessing, strength, and related params.
   * This is the preferred format - takes precedence over legacy scattered params.
   */
  structure_guidance?: StructureGuidanceConfig;

  /**
   * NEW: Array of structure video configurations for multi-video support.
   * Each video can target a specific output frame range with its own settings.
   */
  structure_videos?: StructureVideoConfig[];

  // ============================================================================
  // LEGACY PARAMS (kept for backward compatibility, prefer structure_guidance)
  // ============================================================================

  /** @deprecated Use structure_guidance + structure_videos array format instead */
  structure_video_path?: string | null;
  /** @deprecated Use structure_guidance + structure_videos array format instead */
  structure_video_treatment?: 'adjust' | 'clip';
  /** @deprecated Use structure_guidance + structure_videos array format instead */
  structure_video_motion_strength?: number;
  /** @deprecated Use structure_guidance + structure_videos array format instead */
  structure_video_type?: 'uni3c' | 'flow' | 'canny' | 'depth';
  /** @deprecated Use structure_guidance.step_window[0] instead */
  uni3c_start_percent?: number;
  /** @deprecated Use structure_guidance.step_window[1] instead */
  uni3c_end_percent?: number;
  /** @deprecated Use structure_guidance.target === 'uni3c' instead */
  use_uni3c?: boolean;

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
 * Configuration for automatic stitching after travel generation.
 * Contains ALL settings needed by the worker to create join tasks independently.
 * This is a self-contained config - does not inherit from travel generation params.
 *
 * Fields match JoinClipsTaskParams to ensure worker has everything needed.
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
