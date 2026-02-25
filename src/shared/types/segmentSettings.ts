/** Canonical travel-between-images settings contracts (camelCase, UI motion scale is 0-100). */

import type { PhaseConfig } from '@/shared/types/phaseConfig';

/** LoRA settings shared by shot defaults and segment overrides. */
export interface LoraConfig {
  id: string;
  name: string;
  path: string;
  strength: number;
  /** For multi-stage LoRAs - low noise variant path */
  lowNoisePath?: string;
  /** Whether this is a multi-stage LoRA (high/low noise variants) */
  isMultiStage?: boolean;
  /** Preview image URL */
  previewImageUrl?: string;
  /** Trigger word for the LoRA */
  triggerWord?: string;
}

/**
 * Core segment settings that can exist at shot level (defaults) or segment level (overrides).
 */
export interface SegmentSettings {
  prompt: string;
  negativePrompt: string;
  textBeforePrompts?: string;
  textAfterPrompts?: string;

  motionMode: 'basic' | 'advanced';
  /** UI scale (0-100). Convert to 0-1 only in task payload assembly. */
  amountOfMotion: number;

  phaseConfig?: PhaseConfig;
  selectedPhasePresetId: string | null;

  loras: LoraConfig[];

  numFrames: number;

  randomSeed: boolean;
  seed?: number;

  makePrimaryVariant: boolean;

  structureMotionStrength?: number;
  structureTreatment?: 'adjust' | 'clip';
  structureUni3cEndPercent?: number;
}

/**
 * Shot-level video settings - extends SegmentSettings with batch-specific fields.
 * This is what's stored in shots.settings['travel-between-images'].
 */
export interface ShotVideoSettings extends SegmentSettings {
  batchVideoFrames: number;
  textBeforePrompts: string;
  textAfterPrompts: string;
  enhancePrompt: boolean;
  generationTypeMode: 'i2v' | 'vace';
}

/**
 * Segment-level overrides - a sparse version of SegmentSettings.
 * Only includes fields that differ from shot defaults.
 * Stored in shot_generations.metadata.segmentOverrides
 */
export type SegmentOverrides = Partial<Omit<SegmentSettings, 'makePrimaryVariant'>>;

export const DEFAULT_SEGMENT_SETTINGS: SegmentSettings = {
  prompt: '',
  negativePrompt: '',
  motionMode: 'basic',
  amountOfMotion: 50,
  phaseConfig: undefined,
  selectedPhasePresetId: null,
  loras: [],
  numFrames: 61,
  randomSeed: true,
  seed: undefined,
  makePrimaryVariant: false,
};

export const DEFAULT_SHOT_VIDEO_SETTINGS: ShotVideoSettings = {
  ...DEFAULT_SEGMENT_SETTINGS,
  batchVideoFrames: 61,
  textBeforePrompts: '',
  textAfterPrompts: '',
  enhancePrompt: false,
  generationTypeMode: 'i2v',
};
