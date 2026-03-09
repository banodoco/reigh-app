import type { SegmentOverrides } from '@/shared/types/segmentSettings';

/**
 * Per-pair LoRA override configuration.
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
 * Per-pair motion settings override.
 * Used by pair override UI indicators.
 */
export interface PairMotionSettings {
  amount_of_motion?: number;
  motion_mode?: 'basic' | 'presets' | 'advanced';
}

/**
 * Metadata stored on shot_generations for timeline and prompt management.
 * This is the single source of truth for segment overrides, enhanced prompts,
 * and timeline-position metadata.
 */
export interface GenerationMetadata {
  // Timeline positioning
  frame_spacing?: number;
  end_frame?: number;
  is_keyframe?: boolean;
  locked?: boolean;
  context_frames?: number;
  user_positioned?: boolean;
  created_by_mode?: 'timeline' | 'batch';
  auto_initialized?: boolean;
  drag_source?: string;
  drag_session_id?: string;

  // Segment-specific overrides and enhanced prompt
  segmentOverrides?: SegmentOverrides;
  enhanced_prompt?: string;

  // Allow additional metadata fields without losing type safety on known keys
  [key: string]: unknown;
}
