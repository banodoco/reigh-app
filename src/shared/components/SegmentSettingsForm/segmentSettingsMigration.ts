/**
 * Segment Settings Migration
 *
 * Format conversion between old/new/legacy metadata formats.
 *
 * Extracted from segmentSettingsUtils.ts to separate the migration/compatibility
 * layer from the public API (presets, helpers, task params).
 *
 * Functions here handle:
 * - Reading settings from variant/generation params (multiple legacy formats)
 * - Building metadata updates (writing new format + cleaning old fields)
 * - Converting between lora formats (legacy object, pair array, ActiveLora)
 */

import type { PhaseConfig } from '@/shared/types/phaseConfig';
import type { ActiveLora } from '@/domains/lora/hooks/useLoraManager';
import { writeSegmentOverrides, type SegmentOverrides, type LoraConfig } from '@/shared/lib/settingsMigration';
import type { SegmentSettings } from './segmentSettingsUtils';
import { stripModeFromPhaseConfig } from './segmentSettingsUtils';

// =============================================================================
// PAIR METADATA TYPE
// =============================================================================

/**
 * PairMetadata defines the shape of shot_generations.metadata.
 *
 * Only types the current format. Legacy fields (pair_*, user_overrides) may
 * still exist in DB rows but are progressively cleaned up by
 * cleanupLegacyPairMetadata/cleanupLegacyUserOverrides during saves.
 */
export interface PairMetadata {
  segmentOverrides?: {
    prompt?: string;
    negativePrompt?: string;
    motionMode?: 'basic' | 'advanced';
    amountOfMotion?: number;
    phaseConfig?: PhaseConfig;
    selectedPhasePresetId?: string | null;
    loras?: Array<{ path: string; strength: number; id?: string; name?: string }>;
    numFrames?: number;
    randomSeed?: boolean;
    seed?: number;
  };
  enhanced_prompt?: string;
  base_prompt_for_enhancement?: string;
  enhance_prompt_enabled?: boolean;
}

// =============================================================================
// LORA FORMAT CONVERTERS
// =============================================================================

/** Convert legacy loras format (Record<url, strength>) to ActiveLora[] */
function legacyLorasToArray(lorasObj: Record<string, number>): ActiveLora[] {
  return Object.entries(lorasObj).map(([url, strength]) => {
    const filename = url.split('/').pop()?.replace('.safetensors', '') || url;
    return {
      id: url,
      name: filename,
      path: url,
      strength: typeof strength === 'number' ? strength : 1.0,
    };
  });
}

/** Convert pair_loras format (Array<{path, strength}>) to ActiveLora[] */
function pairLorasToArray(pairLoras: Array<{ path: string; strength: number }>): ActiveLora[] {
  return pairLoras.map((lora) => {
    const filename = lora.path.split('/').pop()?.replace('.safetensors', '') || lora.path;
    return {
      id: lora.path,
      name: filename,
      path: lora.path,
      strength: lora.strength,
    };
  });
}

// =============================================================================
// EXTRACT SETTINGS FROM PARAMS
// =============================================================================

/**
 * Extract SegmentSettings from variant/generation params.
 * Used to populate the form with settings from an existing generation.
 *
 * Handles multiple legacy formats:
 * - Top-level fields (base_prompt, amount_of_motion, etc.)
 * - Nested orchestrator_details
 * - Legacy additional_loras (object format)
 * - New loras (array format)
 */
export function extractSettingsFromParams(
  params: Record<string, unknown>,
  defaults?: Partial<SegmentSettings>
): SegmentSettings {

  // Handle nested orchestrator_details (common in task params)
  const orchDetails = (params.orchestrator_details || {}) as Record<string, unknown>;

  // Extract prompt: base_prompt > prompt > orchestrator > default
  const prompt = (params.base_prompt ?? params.prompt ?? orchDetails.base_prompt ?? defaults?.prompt ?? '') as string;

  // Extract negative prompt
  const negativePrompt = (params.negative_prompt ?? orchDetails.negative_prompt ?? defaults?.negativePrompt ?? '') as string;

  // Extract num_frames
  const numFrames = (params.num_frames ?? orchDetails.num_frames ?? defaults?.numFrames ?? 25) as number;

  // Extract seed/randomSeed
  const randomSeed = (params.random_seed ?? orchDetails.random_seed ?? defaults?.randomSeed ?? true) as boolean;
  const seed = (params.seed ?? orchDetails.seed ?? defaults?.seed) as number | undefined;

  // Extract motion settings
  const motionMode = (params.motion_mode ?? orchDetails.motion_mode ?? defaults?.motionMode ?? 'basic') as 'basic' | 'advanced';
  const amountOfMotion = params.amount_of_motion != null
    ? Math.round((params.amount_of_motion as number) * 100) // Convert 0-1 to 0-100
    : (orchDetails.amount_of_motion != null
        ? Math.round((orchDetails.amount_of_motion as number) * 100)
        : (defaults?.amountOfMotion ?? 50));

  // Extract phase config (only if advanced mode)
  let phaseConfig: PhaseConfig | undefined = undefined;
  if (motionMode === 'advanced') {
    phaseConfig = (params.phase_config ?? orchDetails.phase_config ?? defaults?.phaseConfig) as PhaseConfig | undefined;
    if (phaseConfig) {
      phaseConfig = stripModeFromPhaseConfig(phaseConfig);
    }
  }

  // Extract selected preset ID
  const selectedPhasePresetId = (params.selected_phase_preset_id ?? orchDetails.selected_phase_preset_id ?? defaults?.selectedPhasePresetId ?? null) as string | null;

  // Extract LoRAs - handle multiple formats
  let loras: ActiveLora[] = [];

  // Format 1: loras array at top level (new format)
  if (Array.isArray(params.loras) && params.loras.length > 0) {
    loras = pairLorasToArray(params.loras as Array<{ path: string; strength: number }>);
  }
  // Format 2: additional_loras object at top level (legacy)
  else if (params.additional_loras && typeof params.additional_loras === 'object' && Object.keys(params.additional_loras as Record<string, unknown>).length > 0) {
    loras = legacyLorasToArray(params.additional_loras as Record<string, number>);
  }
  // Format 3: in orchestrator_details (either format)
  else if (Array.isArray(orchDetails.loras) && orchDetails.loras.length > 0) {
    loras = pairLorasToArray(orchDetails.loras as Array<{ path: string; strength: number }>);
  }
  else if (orchDetails.additional_loras && typeof orchDetails.additional_loras === 'object' && Object.keys(orchDetails.additional_loras as Record<string, unknown>).length > 0) {
    loras = legacyLorasToArray(orchDetails.additional_loras as Record<string, number>);
  }
  // Format 4: use defaults if provided
  else if (defaults?.loras) {
    loras = defaults.loras;
  }

  const result = {
    prompt,
    negativePrompt,
    motionMode,
    amountOfMotion,
    phaseConfig,
    selectedPhasePresetId,
    loras,
    numFrames,
    randomSeed,
    seed,
    makePrimaryVariant: defaults?.makePrimaryVariant ?? false,
  };

  return result;
}

// =============================================================================
// BUILD METADATA UPDATE
// =============================================================================

/**
 * Settings to save to pair metadata.
 * Convention:
 *   undefined = don't touch this field
 *   null = explicitly clear (for nullable fields)
 *   '' = explicitly clear override (for string fields)
 *   value = set the override
 */
interface PairSettingsToSave {
  prompt?: string;
  negativePrompt?: string;
  textBeforePrompts?: string;
  textAfterPrompts?: string;
  motionMode?: 'basic' | 'advanced';
  amountOfMotion?: number;
  phaseConfig?: PhaseConfig | null; // null means clear
  loras?: ActiveLora[];
  // Video settings
  numFrames?: number;
  randomSeed?: boolean;
  seed?: number;
  // UI state
  selectedPhasePresetId?: string | null;
  // Structure video overrides
  structureMotionStrength?: number;
  structureTreatment?: 'adjust' | 'clip';
  structureUni3cEndPercent?: number;
}

type TextOverrideKey = 'prompt' | 'negativePrompt' | 'textBeforePrompts' | 'textAfterPrompts';

function setTextOverride(
  overrides: SegmentOverrides,
  fieldsToClear: (keyof SegmentOverrides)[],
  key: TextOverrideKey,
  value: string | undefined
): void {
  if (value === undefined) return;
  if (value === '') {
    fieldsToClear.push(key);
    return;
  }
  overrides[key] = value;
}

function setNullableOverride<K extends keyof SegmentOverrides>(
  overrides: SegmentOverrides,
  fieldsToClear: K[],
  key: K,
  value: SegmentOverrides[K] | null | undefined
): void {
  if (value === undefined) return;
  if (value === null) {
    fieldsToClear.push(key);
    return;
  }
  overrides[key] = value;
}

function applyPairSettingsToOverrides(
  settings: PairSettingsToSave,
  overrides: SegmentOverrides,
  fieldsToClear: (keyof SegmentOverrides)[]
): void {
  setTextOverride(overrides, fieldsToClear, 'prompt', settings.prompt);
  setTextOverride(overrides, fieldsToClear, 'negativePrompt', settings.negativePrompt);
  setTextOverride(overrides, fieldsToClear, 'textBeforePrompts', settings.textBeforePrompts);
  setTextOverride(overrides, fieldsToClear, 'textAfterPrompts', settings.textAfterPrompts);

  setNullableOverride(overrides, fieldsToClear, 'motionMode', settings.motionMode);
  setNullableOverride(overrides, fieldsToClear, 'amountOfMotion', settings.amountOfMotion);

  if (settings.phaseConfig !== undefined) {
    if (settings.phaseConfig === null) {
      fieldsToClear.push('phaseConfig');
    } else {
      overrides.phaseConfig = stripModeFromPhaseConfig(settings.phaseConfig);
    }
  }

  if (settings.loras !== undefined) {
    if (settings.loras === null) {
      fieldsToClear.push('loras');
    } else {
      overrides.loras = settings.loras.map((l): LoraConfig => ({
        id: l.id,
        name: l.name,
        path: l.path,
        strength: l.strength,
      }));
    }
  }

  if (settings.randomSeed !== undefined) {
    overrides.randomSeed = settings.randomSeed;
  }
  if (settings.seed !== undefined) {
    overrides.seed = settings.seed;
  }

  setNullableOverride(overrides, fieldsToClear, 'selectedPhasePresetId', settings.selectedPhasePresetId);
  setNullableOverride(overrides, fieldsToClear, 'structureMotionStrength', settings.structureMotionStrength);
  setNullableOverride(overrides, fieldsToClear, 'structureTreatment', settings.structureTreatment);
  setNullableOverride(overrides, fieldsToClear, 'structureUni3cEndPercent', settings.structureUni3cEndPercent);
}

function clearFields(
  target: Record<string, unknown>,
  fields: string[]
): void {
  fields.forEach((field) => {
    delete target[field];
  });
}

function cleanupLegacyPairMetadata(
  metadata: Record<string, unknown>,
  settings: PairSettingsToSave
): void {
  if (settings.prompt !== undefined) delete metadata.pair_prompt;
  if (settings.negativePrompt !== undefined) delete metadata.pair_negative_prompt;
  if (settings.motionMode !== undefined || settings.amountOfMotion !== undefined) {
    delete metadata.pair_motion_settings;
  }
  if (settings.phaseConfig !== undefined) delete metadata.pair_phase_config;
  if (settings.loras !== undefined) delete metadata.pair_loras;
  if (settings.randomSeed !== undefined) delete metadata.pair_random_seed;
  if (settings.seed !== undefined) delete metadata.pair_seed;
  if (settings.selectedPhasePresetId !== undefined) delete metadata.pair_selected_phase_preset_id;
}

function cleanupLegacyUserOverrides(
  metadata: Record<string, unknown>,
  settings: PairSettingsToSave
): void {
  const userOverrides = metadata.user_overrides as Record<string, unknown> | undefined;
  if (!userOverrides) return;

  if (settings.motionMode !== undefined) delete userOverrides.motion_mode;
  if (settings.amountOfMotion !== undefined) delete userOverrides.amount_of_motion;
  if (settings.phaseConfig !== undefined) delete userOverrides.phase_config;
  if (settings.loras !== undefined) delete userOverrides.additional_loras;

  if (Object.keys(userOverrides).length === 0) {
    delete metadata.user_overrides;
  }
}

/**
 * Build metadata update payload for saving pair settings.
 *
 * Writes to the new segmentOverrides format and cleans up old pair_* and
 * legacy user_overrides fields from the metadata.
 */
export function buildMetadataUpdate(
  currentMetadata: Record<string, unknown>,
  settings: PairSettingsToSave
): Record<string, unknown> {
  const overrides: SegmentOverrides = {};
  const fieldsToClear: (keyof SegmentOverrides)[] = [];
  applyPairSettingsToOverrides(settings, overrides, fieldsToClear);

  // Use writeSegmentOverrides to write to new format
  const newMetadata = writeSegmentOverrides(currentMetadata, overrides);

  // Access segmentOverrides as a mutable record for cleanup operations
  const segOverrides = newMetadata.segmentOverrides as Record<string, unknown> | undefined;

  // Handle explicit clear of phaseConfig (when switching to basic mode)
  if (settings.phaseConfig === null && segOverrides) {
    delete segOverrides.phaseConfig;
    // Note: selectedPhasePresetId is handled independently via fieldsToClear.
    // Don't cascade-delete it here — basic mode presets need to persist.
  }

  // Handle explicitly cleared fields ('' or null means remove override, use shot default)
  if (fieldsToClear.length > 0 && segOverrides) {
    clearFields(segOverrides, fieldsToClear as string[]);
  }

  cleanupLegacyPairMetadata(newMetadata, settings);
  cleanupLegacyUserOverrides(newMetadata, settings);

  return newMetadata;
}
