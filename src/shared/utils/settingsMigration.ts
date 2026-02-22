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

export type {
  ShotVideoSettings,
  SegmentOverrides,
  LoraConfig,
};

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

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function toString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function toNullableString(value: unknown, fallback: string | null): string | null {
  if (value === null) return null;
  return typeof value === 'string' ? value : fallback;
}

function toNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function toOptionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function toBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function toMotionMode(
  value: unknown,
  fallback: SegmentSettings['motionMode']
): SegmentSettings['motionMode'] {
  return value === 'basic' || value === 'advanced' ? value : fallback;
}

function toGenerationTypeMode(
  value: unknown,
  fallback: ShotVideoSettings['generationTypeMode']
): ShotVideoSettings['generationTypeMode'] {
  return value === 'i2v' || value === 'vace' ? value : fallback;
}

function toStructureTreatment(value: unknown): SegmentSettings['structureTreatment'] | undefined {
  return value === 'adjust' || value === 'clip' ? value : undefined;
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

  const settings: ShotVideoSettings = {
    // Prompts (unified field names after DB migration)
    prompt: toString(raw.prompt, DEFAULT_SHOT_VIDEO_SETTINGS.prompt),
    negativePrompt: toString(raw.negativePrompt, DEFAULT_SHOT_VIDEO_SETTINGS.negativePrompt),

    // Motion
    motionMode: toMotionMode(raw.motionMode, DEFAULT_SHOT_VIDEO_SETTINGS.motionMode),
    amountOfMotion: normalizeMotionAmount(toOptionalNumber(raw.amountOfMotion)),

    // Advanced config
    phaseConfig: (toRecord(raw.phaseConfig) as unknown as SegmentSettings['phaseConfig']) ?? undefined,
    selectedPhasePresetId: toNullableString(raw.selectedPhasePresetId, DEFAULT_SHOT_VIDEO_SETTINGS.selectedPhasePresetId),

    // LoRAs (unified field name after DB migration)
    loras: migrateLoras(raw.loras as Record<string, unknown>[] | undefined | null),

    // Video
    numFrames: toNumber(raw.numFrames, DEFAULT_SHOT_VIDEO_SETTINGS.numFrames),

    // Seed
    randomSeed: toBoolean(raw.randomSeed, DEFAULT_SHOT_VIDEO_SETTINGS.randomSeed),
    seed: toOptionalNumber(raw.seed),

    // Variant behavior
    makePrimaryVariant: toBoolean(raw.makePrimaryVariant, DEFAULT_SHOT_VIDEO_SETTINGS.makePrimaryVariant),

    // Batch-specific
    batchVideoFrames: toNumber(raw.batchVideoFrames, DEFAULT_SHOT_VIDEO_SETTINGS.batchVideoFrames),
    textBeforePrompts: toString(raw.textBeforePrompts, DEFAULT_SHOT_VIDEO_SETTINGS.textBeforePrompts),
    textAfterPrompts: toString(raw.textAfterPrompts, DEFAULT_SHOT_VIDEO_SETTINGS.textAfterPrompts),
    enhancePrompt: toBoolean(raw.enhancePrompt, DEFAULT_SHOT_VIDEO_SETTINGS.enhancePrompt),
    generationTypeMode: toGenerationTypeMode(raw.generationTypeMode, DEFAULT_SHOT_VIDEO_SETTINGS.generationTypeMode),
  };

  return settings;
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
  const segmentOverrides = toRecord(metadata.segmentOverrides) ?? {};

  // Prompt - include empty strings to distinguish "explicitly empty" from "no override"
  if (segmentOverrides.prompt !== undefined) {
    overrides.prompt = toString(segmentOverrides.prompt, '');
  }

  // Negative prompt - include empty strings to distinguish "explicitly empty" from "no override"
  if (segmentOverrides.negativePrompt !== undefined) {
    overrides.negativePrompt = toString(segmentOverrides.negativePrompt, '');
  }

  // Motion mode
  if (segmentOverrides.motionMode !== undefined) {
    overrides.motionMode = toMotionMode(segmentOverrides.motionMode, DEFAULT_SEGMENT_SETTINGS.motionMode);
  }

  // Motion amount (normalize to 0-100 scale)
  if (segmentOverrides.amountOfMotion !== undefined) {
    const motionAmount = toOptionalNumber(segmentOverrides.amountOfMotion);
    if (motionAmount !== undefined) {
      overrides.amountOfMotion = normalizeMotionAmount(motionAmount);
    }
  }

  // Phase config
  if (segmentOverrides.phaseConfig !== undefined) {
    const phaseConfig = toRecord(segmentOverrides.phaseConfig) as unknown as SegmentSettings['phaseConfig'];
    if (phaseConfig) {
      overrides.phaseConfig = phaseConfig;
    }
  }

  // Phase preset ID
  if (segmentOverrides.selectedPhasePresetId !== undefined) {
    overrides.selectedPhasePresetId = toNullableString(segmentOverrides.selectedPhasePresetId, null);
  }

  // LoRAs - include empty arrays to distinguish "explicitly no loras" from "no override"
  if (segmentOverrides.loras !== undefined && Array.isArray(segmentOverrides.loras)) {
    overrides.loras = migrateLoras(segmentOverrides.loras as Record<string, unknown>[]);
  }

  // Frame count
  if (segmentOverrides.numFrames !== undefined) {
    const numFrames = toOptionalNumber(segmentOverrides.numFrames);
    if (numFrames !== undefined) {
      overrides.numFrames = numFrames;
    }
  }

  // Random seed
  if (segmentOverrides.randomSeed !== undefined) {
    overrides.randomSeed = toBoolean(segmentOverrides.randomSeed, DEFAULT_SEGMENT_SETTINGS.randomSeed);
  }

  // Seed
  if (segmentOverrides.seed !== undefined) {
    const seed = toOptionalNumber(segmentOverrides.seed);
    if (seed !== undefined) {
      overrides.seed = seed;
    }
  }

  // Structure video overrides
  if (segmentOverrides.structureMotionStrength !== undefined) {
    const structureMotionStrength = toOptionalNumber(segmentOverrides.structureMotionStrength);
    if (structureMotionStrength !== undefined) {
      overrides.structureMotionStrength = structureMotionStrength;
    }
  }
  if (segmentOverrides.structureTreatment !== undefined) {
    const structureTreatment = toStructureTreatment(segmentOverrides.structureTreatment);
    if (structureTreatment) {
      overrides.structureTreatment = structureTreatment;
    }
  }
  if (segmentOverrides.structureUni3cEndPercent !== undefined) {
    const uni3cEndPercent = toOptionalNumber(segmentOverrides.structureUni3cEndPercent);
    if (uni3cEndPercent !== undefined) {
      overrides.structureUni3cEndPercent = uni3cEndPercent;
    }
  }

  // Text before/after prompts
  if (segmentOverrides.textBeforePrompts !== undefined) {
    overrides.textBeforePrompts = toString(segmentOverrides.textBeforePrompts, '');
  }
  if (segmentOverrides.textAfterPrompts !== undefined) {
    overrides.textAfterPrompts = toString(segmentOverrides.textAfterPrompts, '');
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

  return metadata;
}
