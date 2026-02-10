/**
 * Settings Migration Utilities
 *
 * These utilities handle reading and writing settings in the unified format.
 *
 * SHOT SETTINGS (shots.settings['travel-between-images']):
 * - prompt, negativePrompt, motionMode, amountOfMotion, phaseConfig,
 *   selectedPhasePresetId, loras, numFrames, randomSeed, seed, etc.
 *
 * SEGMENT OVERRIDES (shot_generations.metadata.segmentOverrides):
 * - prompt, negativePrompt, motionMode, amountOfMotion, phaseConfig,
 *   selectedPhasePresetId, loras, numFrames, randomSeed, seed
 *
 * NOTE: Old field names (batchVideoPrompt, selectedLoras, pair_* fields) were
 * migrated to new names via DB migration 20260125_migrate_settings_field_names.sql.
 */

import type {
  SegmentSettings,
  ShotVideoSettings,
  SegmentOverrides,
  LoraConfig,
} from '@/shared/types/segmentSettings';
import {
  DEFAULT_SEGMENT_SETTINGS,
  DEFAULT_SHOT_VIDEO_SETTINGS,
} from '@/shared/types/segmentSettings';

// =============================================================================
// LORA MIGRATION
// =============================================================================

/**
 * Migrate LoRA from any format to LoraConfig.
 * Handles both old ShotLora and new LoraConfig formats.
 */
function migrateLoraConfig(lora: Record<string, unknown>): LoraConfig {
  return {
    id: (lora.id as string) ?? (lora.path as string) ?? '',
    name: (lora.name as string) ?? '',
    path: (lora.path as string) ?? '',
    strength: (lora.strength as number) ?? 1.0,
    lowNoisePath: lora.lowNoisePath as string | undefined,
    isMultiStage: lora.isMultiStage as boolean | undefined,
    previewImageUrl: lora.previewImageUrl as string | undefined,
    triggerWord: (lora.triggerWord as string) ?? (lora.trigger_word as string),
  };
}

/**
 * Migrate an array of LoRAs to the new format.
 */
function migrateLoras(loras: Record<string, unknown>[] | undefined | null): LoraConfig[] {
  if (!loras || !Array.isArray(loras)) return [];
  return loras.map(migrateLoraConfig);
}

// =============================================================================
// MOTION AMOUNT NORMALIZATION
// =============================================================================

/**
 * Normalize motion amount to 0-100 scale.
 * Old pair metadata stored 0-1, new format uses 0-100.
 */
function normalizeMotionAmount(value: number | undefined): number {
  if (value === undefined) return DEFAULT_SEGMENT_SETTINGS.amountOfMotion;
  // If value is <= 1, assume it's in 0-1 scale and convert
  return value <= 1 ? value * 100 : value;
}

/**
 * Convert motion amount from UI scale (0-100) to backend scale (0-1).
 * Only use this at task submission time.
 */
function motionAmountToBackend(value: number): number {
  return value / 100;
}

// =============================================================================
// SHOT SETTINGS MIGRATION
// =============================================================================

/**
 * Read shot settings from unified format.
 *
 * @param raw - Raw settings object from shots.settings['travel-between-images']
 * @returns Normalized ShotVideoSettings
 */
export function readShotSettings(raw: Record<string, unknown> | null | undefined): ShotVideoSettings {
  if (!raw) return { ...DEFAULT_SHOT_VIDEO_SETTINGS };

  return {
    // Prompts (unified field names after DB migration)
    prompt: raw.prompt ?? DEFAULT_SHOT_VIDEO_SETTINGS.prompt,
    negativePrompt: raw.negativePrompt ?? DEFAULT_SHOT_VIDEO_SETTINGS.negativePrompt,

    // Motion
    motionMode: raw.motionMode ?? DEFAULT_SHOT_VIDEO_SETTINGS.motionMode,
    amountOfMotion: normalizeMotionAmount(raw.amountOfMotion as number | undefined),

    // Advanced config
    phaseConfig: raw.phaseConfig,
    selectedPhasePresetId: raw.selectedPhasePresetId ?? DEFAULT_SHOT_VIDEO_SETTINGS.selectedPhasePresetId,

    // LoRAs (unified field name after DB migration)
    loras: migrateLoras(raw.loras as Record<string, unknown>[] | undefined | null),

    // Video
    numFrames: raw.numFrames ?? DEFAULT_SHOT_VIDEO_SETTINGS.numFrames,

    // Seed
    randomSeed: raw.randomSeed ?? DEFAULT_SHOT_VIDEO_SETTINGS.randomSeed,
    seed: raw.seed,

    // Variant behavior
    makePrimaryVariant: raw.makePrimaryVariant ?? DEFAULT_SHOT_VIDEO_SETTINGS.makePrimaryVariant,

    // Batch-specific
    batchVideoFrames: raw.batchVideoFrames ?? DEFAULT_SHOT_VIDEO_SETTINGS.batchVideoFrames,
    textBeforePrompts: raw.textBeforePrompts ?? DEFAULT_SHOT_VIDEO_SETTINGS.textBeforePrompts,
    textAfterPrompts: raw.textAfterPrompts ?? DEFAULT_SHOT_VIDEO_SETTINGS.textAfterPrompts,
    enhancePrompt: raw.enhancePrompt ?? DEFAULT_SHOT_VIDEO_SETTINGS.enhancePrompt,
    generationTypeMode: raw.generationTypeMode ?? DEFAULT_SHOT_VIDEO_SETTINGS.generationTypeMode,

    // Legacy (for any code still reading this)
    advancedMode: raw.advancedMode,
  };
}

// =============================================================================
// SEGMENT/PAIR METADATA MIGRATION
// =============================================================================

/**
 * Read segment overrides from metadata.
 * Returns sparse SegmentOverrides with only overridden fields.
 *
 * @param metadata - Raw metadata object from shot_generations.metadata
 * @returns Sparse SegmentOverrides (only fields that were set)
 */
export function readSegmentOverrides(metadata: Record<string, unknown> | null | undefined): SegmentOverrides {
  if (!metadata) return {};

  const overrides: SegmentOverrides = {};
  const segmentOverrides = (metadata.segmentOverrides ?? {}) as Record<string, unknown>;

  // Prompt - include empty strings to distinguish "explicitly empty" from "no override"
  if (segmentOverrides.prompt !== undefined) {
    overrides.prompt = segmentOverrides.prompt as string;
  }

  // Negative prompt - include empty strings to distinguish "explicitly empty" from "no override"
  if (segmentOverrides.negativePrompt !== undefined) {
    overrides.negativePrompt = segmentOverrides.negativePrompt as string;
  }

  // Motion mode
  if (segmentOverrides.motionMode !== undefined) {
    overrides.motionMode = segmentOverrides.motionMode as SegmentSettings['motionMode'];
  }

  // Motion amount (normalize to 0-100 scale)
  if (segmentOverrides.amountOfMotion !== undefined) {
    overrides.amountOfMotion = normalizeMotionAmount(segmentOverrides.amountOfMotion as number);
  }

  // Phase config
  if (segmentOverrides.phaseConfig !== undefined) {
    overrides.phaseConfig = segmentOverrides.phaseConfig as SegmentSettings['phaseConfig'];
  }

  // Phase preset ID
  if (segmentOverrides.selectedPhasePresetId !== undefined) {
    overrides.selectedPhasePresetId = segmentOverrides.selectedPhasePresetId as string | null;
  }

  // LoRAs - include empty arrays to distinguish "explicitly no loras" from "no override"
  if (segmentOverrides.loras !== undefined && Array.isArray(segmentOverrides.loras)) {
    overrides.loras = migrateLoras(segmentOverrides.loras as Record<string, unknown>[]);
  }

  // Frame count
  if (segmentOverrides.numFrames !== undefined) {
    overrides.numFrames = segmentOverrides.numFrames as number;
  }

  // Random seed
  if (segmentOverrides.randomSeed !== undefined) {
    overrides.randomSeed = segmentOverrides.randomSeed as boolean;
  }

  // Seed
  if (segmentOverrides.seed !== undefined) {
    overrides.seed = segmentOverrides.seed as number;
  }

  // Structure video overrides
  if (segmentOverrides.structureMotionStrength !== undefined) {
    overrides.structureMotionStrength = segmentOverrides.structureMotionStrength as number;
  }
  if (segmentOverrides.structureTreatment !== undefined) {
    overrides.structureTreatment = segmentOverrides.structureTreatment as string;
  }
  if (segmentOverrides.structureUni3cEndPercent !== undefined) {
    overrides.structureUni3cEndPercent = segmentOverrides.structureUni3cEndPercent as number;
  }

  // Text before/after prompts
  if (segmentOverrides.textBeforePrompts !== undefined) {
    overrides.textBeforePrompts = segmentOverrides.textBeforePrompts as string;
  }
  if (segmentOverrides.textAfterPrompts !== undefined) {
    overrides.textAfterPrompts = segmentOverrides.textAfterPrompts as string;
  }

  return overrides;
}

/**
 * Write segment overrides to metadata in new format.
 * MERGES with existing segmentOverrides - only updates fields present in overrides.
 * Use `null` value to explicitly delete a field.
 *
 * @param currentMetadata - Current metadata object
 * @param overrides - New segment overrides to write (null values delete the field)
 * @returns Updated metadata object
 */
export function writeSegmentOverrides(
  currentMetadata: Record<string, unknown> | null | undefined,
  overrides: SegmentOverrides
): Record<string, unknown> {
  const metadata = { ...(currentMetadata ?? {}) };

  // Start with existing segmentOverrides (merge, not replace)
  const existingOverrides = (metadata.segmentOverrides ?? {}) as Record<string, unknown>;
  const newOverrides = { ...existingOverrides };

  // Update each field if present in overrides
  // Use explicit undefined check so we can distinguish "not provided" from "set to value"
  if (overrides.prompt !== undefined) {
    newOverrides.prompt = overrides.prompt;
  }
  if (overrides.negativePrompt !== undefined) {
    newOverrides.negativePrompt = overrides.negativePrompt;
  }
  if (overrides.motionMode !== undefined) {
    newOverrides.motionMode = overrides.motionMode;
  }
  if (overrides.amountOfMotion !== undefined) {
    newOverrides.amountOfMotion = overrides.amountOfMotion;
  }
  if (overrides.phaseConfig !== undefined) {
    newOverrides.phaseConfig = overrides.phaseConfig;
  }
  if (overrides.selectedPhasePresetId !== undefined) {
    newOverrides.selectedPhasePresetId = overrides.selectedPhasePresetId;
  }
  if (overrides.loras !== undefined) {
    newOverrides.loras = overrides.loras;  // Preserve empty arrays to distinguish "no loras" from "use shot default"
  }
  if (overrides.numFrames !== undefined) {
    newOverrides.numFrames = overrides.numFrames;
  }
  if (overrides.randomSeed !== undefined) {
    newOverrides.randomSeed = overrides.randomSeed;
  }
  if (overrides.seed !== undefined) {
    newOverrides.seed = overrides.seed;
  }
  // Structure video overrides
  if (overrides.structureMotionStrength !== undefined) {
    newOverrides.structureMotionStrength = overrides.structureMotionStrength;
  }
  if (overrides.structureTreatment !== undefined) {
    newOverrides.structureTreatment = overrides.structureTreatment;
  }
  if (overrides.structureUni3cEndPercent !== undefined) {
    newOverrides.structureUni3cEndPercent = overrides.structureUni3cEndPercent;
  }
  // Text before/after prompts
  if (overrides.textBeforePrompts !== undefined) {
    newOverrides.textBeforePrompts = overrides.textBeforePrompts;
  }
  if (overrides.textAfterPrompts !== undefined) {
    newOverrides.textAfterPrompts = overrides.textAfterPrompts;
  }

  metadata.segmentOverrides = newOverrides;

  // Clean up empty segmentOverrides
  if (Object.keys(newOverrides).length === 0) {
    delete metadata.segmentOverrides;
  }

  const savedOverrides = metadata.segmentOverrides as Record<string, unknown> | undefined;

  return metadata;
}

