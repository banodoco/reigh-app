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
import { coerceSelectedModel, isSelectedModel } from '@/tools/travel-between-images/settings';
import type { TravelGuidanceMode } from '@/shared/lib/tasks/travelGuidance';
import type {
  PhaseConfig,
  PhaseLoraConfig,
  PhaseSettings,
} from '@/shared/types/phaseConfig';
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
function migrateLoraConfig(lora: Record<string, unknown>): LoraConfig | null {
  const id = toString(lora.id, toString(lora.path, ''));
  const name = toString(lora.name, '');
  const path = toString(lora.path, '');
  if (!id || !name || !path) {
    return null;
  }

  return {
    id,
    name,
    path,
    strength: toNumber(lora.strength, 1.0),
    ...(typeof lora.lowNoisePath === 'string' ? { lowNoisePath: lora.lowNoisePath } : {}),
    ...(typeof lora.isMultiStage === 'boolean' ? { isMultiStage: lora.isMultiStage } : {}),
    ...(typeof lora.previewImageUrl === 'string' ? { previewImageUrl: lora.previewImageUrl } : {}),
    ...(typeof lora.triggerWord === 'string'
      ? { triggerWord: lora.triggerWord }
      : typeof lora.trigger_word === 'string'
        ? { triggerWord: lora.trigger_word }
        : {}),
  };
}

/**
 * Migrate an array of LoRAs to the new format.
 */
function migrateLoras(loras: Record<string, unknown>[] | undefined | null): LoraConfig[] {
  if (!loras || !Array.isArray(loras)) return [];
  return loras
    .map(migrateLoraConfig)
    .filter((entry): entry is LoraConfig => entry !== null);
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

function toGuidanceTreatment(value: unknown): SegmentSettings['guidanceTreatment'] | undefined {
  return value === 'adjust' || value === 'clip' ? value : undefined;
}

function toSelectedModel(value: unknown): SegmentSettings['selectedModel'] | undefined {
  return isSelectedModel(value) ? value : undefined;
}

function toTravelGuidanceMode(value: unknown): TravelGuidanceMode | undefined {
  return value === 'uni3c'
    || value === 'flow'
    || value === 'canny'
    || value === 'depth'
    || value === 'raw'
    || value === 'pose'
    || value === 'video'
    ? value
    : undefined;
}

function toNumberArray(value: unknown): number[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry))
    ? value
    : undefined;
}

function decodePhaseLoraConfig(value: unknown): PhaseLoraConfig | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const url = typeof record.url === 'string' ? record.url : null;
  const multiplier = typeof record.multiplier === 'string' ? record.multiplier : null;
  if (!url || !multiplier) {
    return null;
  }

  return { url, multiplier };
}

function decodePhaseSettings(value: unknown): PhaseSettings | null {
  const record = toRecord(value);
  if (!record) {
    return null;
  }

  const phase = toOptionalNumber(record.phase);
  const guidanceScale = toOptionalNumber(record.guidance_scale);
  const loras = Array.isArray(record.loras)
    ? record.loras
      .map(decodePhaseLoraConfig)
      .filter((entry): entry is PhaseLoraConfig => entry !== null)
    : null;

  if (phase === undefined || guidanceScale === undefined || !loras) {
    return null;
  }

  return {
    phase,
    guidance_scale: guidanceScale,
    loras,
  };
}

function decodePhaseConfig(value: unknown): PhaseConfig | undefined {
  const record = toRecord(value);
  if (!record) {
    return undefined;
  }

  const numPhases = toOptionalNumber(record.num_phases);
  const stepsPerPhase = toNumberArray(record.steps_per_phase);
  const flowShift = toOptionalNumber(record.flow_shift);
  const sampleSolver = typeof record.sample_solver === 'string' ? record.sample_solver : undefined;
  const modelSwitchPhase = toOptionalNumber(record.model_switch_phase);
  const phases = Array.isArray(record.phases)
    ? record.phases
      .map(decodePhaseSettings)
      .filter((entry): entry is PhaseSettings => entry !== null)
    : undefined;

  if (
    numPhases === undefined
    || !stepsPerPhase
    || flowShift === undefined
    || !sampleSolver
    || modelSwitchPhase === undefined
    || !phases
  ) {
    return undefined;
  }

  return {
    num_phases: numPhases,
    steps_per_phase: stepsPerPhase,
    flow_shift: flowShift,
    sample_solver: sampleSolver,
    model_switch_phase: modelSwitchPhase,
    phases,
    ...(record.mode === 'i2v' || record.mode === 'vace' ? { mode: record.mode } : {}),
  };
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
    phaseConfig: decodePhaseConfig(raw.phaseConfig),
    selectedPhasePresetId: toNullableString(raw.selectedPhasePresetId, DEFAULT_SHOT_VIDEO_SETTINGS.selectedPhasePresetId),

    // LoRAs (unified field name after DB migration)
    loras: Array.isArray(raw.loras)
      ? migrateLoras(raw.loras.filter((entry): entry is Record<string, unknown> => toRecord(entry) !== null))
      : [],

    // Video
    numFrames: toNumber(raw.numFrames, DEFAULT_SHOT_VIDEO_SETTINGS.numFrames),

    // Seed
    randomSeed: toBoolean(raw.randomSeed, DEFAULT_SHOT_VIDEO_SETTINGS.randomSeed),
    seed: toOptionalNumber(raw.seed),
    selectedModel: toSelectedModel(raw.selectedModel) ?? DEFAULT_SHOT_VIDEO_SETTINGS.selectedModel,
    guidanceScale: toOptionalNumber(raw.guidanceScale),

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
    const phaseConfig = decodePhaseConfig(segmentOverrides.phaseConfig);
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
    overrides.loras = migrateLoras(
      segmentOverrides.loras.filter((entry): entry is Record<string, unknown> => toRecord(entry) !== null),
    );
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

  if (segmentOverrides.selectedModel !== undefined) {
    const selectedModel = toSelectedModel(segmentOverrides.selectedModel);
    if (selectedModel) {
      overrides.selectedModel = selectedModel;
    }
  }
  if (segmentOverrides.guidanceScale !== undefined) {
    const guidanceScale = toOptionalNumber(segmentOverrides.guidanceScale);
    if (guidanceScale !== undefined) {
      overrides.guidanceScale = guidanceScale;
    }
  }
  if (segmentOverrides.inferenceSteps !== undefined) {
    const inferenceSteps = toOptionalNumber(segmentOverrides.inferenceSteps);
    if (inferenceSteps !== undefined) {
      overrides.inferenceSteps = inferenceSteps;
    }
  }
  if (segmentOverrides.guidanceMode !== undefined) {
    const guidanceMode = toTravelGuidanceMode(segmentOverrides.guidanceMode);
    if (guidanceMode) {
      overrides.guidanceMode = guidanceMode;
    }
  }
  if (segmentOverrides.guidanceStrength !== undefined || segmentOverrides.structureMotionStrength !== undefined) {
    const guidanceStrength = toOptionalNumber(
      segmentOverrides.guidanceStrength ?? segmentOverrides.structureMotionStrength,
    );
    if (guidanceStrength !== undefined) {
      overrides.guidanceStrength = guidanceStrength;
    }
  }
  if (segmentOverrides.guidanceTreatment !== undefined || segmentOverrides.structureTreatment !== undefined) {
    const guidanceTreatment = toGuidanceTreatment(
      segmentOverrides.guidanceTreatment ?? segmentOverrides.structureTreatment,
    );
    if (guidanceTreatment) {
      overrides.guidanceTreatment = guidanceTreatment;
    }
  }
  if (segmentOverrides.guidanceUni3cEndPercent !== undefined || segmentOverrides.structureUni3cEndPercent !== undefined) {
    const uni3cEndPercent = toOptionalNumber(
      segmentOverrides.guidanceUni3cEndPercent ?? segmentOverrides.structureUni3cEndPercent,
    );
    if (uni3cEndPercent !== undefined) {
      overrides.guidanceUni3cEndPercent = uni3cEndPercent;
    }
  }
  if (segmentOverrides.guidanceCannyIntensity !== undefined) {
    const guidanceCannyIntensity = toOptionalNumber(segmentOverrides.guidanceCannyIntensity);
    if (guidanceCannyIntensity !== undefined) {
      overrides.guidanceCannyIntensity = guidanceCannyIntensity;
    }
  }
  if (segmentOverrides.guidanceDepthContrast !== undefined) {
    const guidanceDepthContrast = toOptionalNumber(segmentOverrides.guidanceDepthContrast);
    if (guidanceDepthContrast !== undefined) {
      overrides.guidanceDepthContrast = guidanceDepthContrast;
    }
  }
  if (segmentOverrides.smoothContinuations !== undefined) {
    overrides.smoothContinuations = toBoolean(segmentOverrides.smoothContinuations, false);
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
  if (overrides.selectedModel !== undefined) {
    newOverrides.selectedModel = overrides.selectedModel;
  }
  if (overrides.guidanceScale !== undefined) {
    newOverrides.guidanceScale = overrides.guidanceScale;
  }
  if (overrides.inferenceSteps !== undefined) {
    newOverrides.inferenceSteps = overrides.inferenceSteps;
  }
  if (overrides.guidanceMode !== undefined) {
    newOverrides.guidanceMode = overrides.guidanceMode;
  }
  if (overrides.guidanceStrength !== undefined) {
    newOverrides.guidanceStrength = overrides.guidanceStrength;
  }
  if (overrides.guidanceTreatment !== undefined) {
    newOverrides.guidanceTreatment = overrides.guidanceTreatment;
  }
  if (overrides.guidanceUni3cEndPercent !== undefined) {
    newOverrides.guidanceUni3cEndPercent = overrides.guidanceUni3cEndPercent;
  }
  if (overrides.guidanceCannyIntensity !== undefined) {
    newOverrides.guidanceCannyIntensity = overrides.guidanceCannyIntensity;
  }
  if (overrides.guidanceDepthContrast !== undefined) {
    newOverrides.guidanceDepthContrast = overrides.guidanceDepthContrast;
  }
  if (overrides.smoothContinuations !== undefined) {
    newOverrides.smoothContinuations = overrides.smoothContinuations;
  }
  if (overrides.seed !== undefined) {
    newOverrides.seed = overrides.seed;
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
