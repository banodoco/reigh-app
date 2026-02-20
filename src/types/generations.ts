import type { SegmentOverrides } from '@/shared/types/segmentSettings';

/**
 * Generation parameters for image/video generation tasks
 * Stored in generations.params for task configuration
 */
export interface GenerationParams {
  prompt?: string;
  base_prompt?: string;
  negative_prompt?: string;
  seed?: number;
  guidance_scale?: number;
  num_inference_steps?: number;
  width?: number;
  height?: number;
  resolution?: string;
  // Allow extension for tool-specific parameters
  [key: string]: unknown;
}

/**
 * Per-pair LoRA override configuration
 * Used by pair override UI indicators.
 */
export interface PairLoraConfig {
  id: string;
  path: string;
  strength: number;
  name?: string;
  lowNoisePath?: string;
  isMultiStage?: boolean;
}

/**
 * Per-pair motion settings override
 * Used by pair override UI indicators.
 */
export interface PairMotionSettings {
  amount_of_motion?: number;
  motion_mode?: 'basic' | 'presets' | 'advanced';
}

/**
 * Metadata stored on shot_generations for timeline and prompt management.
 */
export interface GenerationMetadata {
  frame_spacing?: number;
  is_keyframe?: boolean;
  locked?: boolean;
  context_frames?: number;
  user_positioned?: boolean;
  created_by_mode?: 'timeline' | 'batch';
  auto_initialized?: boolean;
  drag_source?: string;
  drag_session_id?: string;
  segmentOverrides?: SegmentOverrides;
  enhanced_prompt?: string;
  [key: string]: unknown;
}

/**
 * Base type for generation rows used across galleries, lightboxes and timelines.
 */
export interface GenerationRow {
  id: string;
  generation_id?: string;
  imageUrl?: string;
  thumbUrl?: string;
  thumbnail_url?: string | null;
  location?: string | null;
  type?: string | null;
  contentType?: string;
  createdAt?: string;
  metadata?: GenerationMetadata;
  isOptimistic?: boolean;
  shotImageEntryId?: string;
  shot_generation_id?: string;
  name?: string;
  timeline_frame?: number;
  starred?: boolean;
  derivedCount?: number;
  hasUnviewedVariants?: boolean;
  unviewedVariantCount?: number;
  based_on?: string | null;
  params?: GenerationParams;
  created_at?: string;
  parent_generation_id?: string | null;
  variant_name?: string;
  is_child?: boolean;
  child_order?: number | null;
  pair_shot_generation_id?: string | null;
  primary_variant_id?: string | null;
}
