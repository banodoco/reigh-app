/**
 * Segment Settings Utilities
 *
 * Clean merge logic for per-segment video generation settings.
 *
 * Priority (highest to lowest):
 * 1. pairMetadata (pair-specific settings from shot_generations.metadata)
 * 2. shotBatchSettings (shot-level defaults from shots.settings)
 * 3. defaults (hardcoded fallbacks)
 *
 * Note: Shot settings inheritance (from previous shot) is handled separately
 * when a new shot is created - see shotSettingsInheritance.ts
 *
 * Key invariants:
 * - Basic mode = no phase_config (always cleared)
 * - New format (pair_X fields at root) takes precedence over legacy (user_overrides.X)
 */

import { PhaseConfig, DEFAULT_PHASE_CONFIG, DEFAULT_VACE_PHASE_CONFIG } from '@/shared/types/phaseConfig';
import type { ActiveLora } from '@/shared/hooks/useLoraManager';
import { readSegmentOverrides, writeSegmentOverrides, type SegmentOverrides, type LoraConfig } from '@/shared/utils/settingsMigration';
import type { StructureVideoConfig } from '@/shared/lib/tasks/travelBetweenImages';

// =============================================================================
// BUILT-IN PRESETS
// =============================================================================

export interface BuiltinPreset {
  id: string;
  metadata: {
    name: string;
    description: string;
    phaseConfig: PhaseConfig;
    generationTypeMode: 'i2v' | 'vace';
  };
}

// Use the same IDs as the batch view (MotionControl.tsx) so shot defaults
// are recognized as known presets when inherited by the segment form.
const BUILTIN_I2V_PRESET_ID = '__builtin_default_i2v__';
const BUILTIN_VACE_PRESET_ID = '__builtin_default_vace__';

export const BUILTIN_I2V_PRESET: BuiltinPreset = {
  id: BUILTIN_I2V_PRESET_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard I2V generation',
    phaseConfig: DEFAULT_PHASE_CONFIG,
    generationTypeMode: 'i2v',
  }
};

export const BUILTIN_VACE_PRESET: BuiltinPreset = {
  id: BUILTIN_VACE_PRESET_ID,
  metadata: {
    name: 'Basic',
    description: 'Standard VACE generation with structure video',
    phaseConfig: DEFAULT_VACE_PHASE_CONFIG,
    generationTypeMode: 'vace',
  }
};

// Featured preset IDs from database (shown after built-in default)
export const SEGMENT_I2V_FEATURED_PRESET_IDS: string[] = [
  'e1aad8bf-add9-4d7b-883b-d67d424028c4',
  '18b879a5-1251-41dc-b263-613358ced541',
];

export const SEGMENT_VACE_FEATURED_PRESET_IDS: string[] = [
  'd72377eb-6d57-4af1-80a3-9b629da28a47',
];

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Result of computing a defaultable field's display state.
 */
export interface DefaultableFieldResult {
  /** Whether the field is currently showing the default value */
  isUsingDefault: boolean;
  /** The value to display in the field */
  displayValue: string;
}

/**
 * Compute display state for a field that can fall back to a default value.
 *
 * Semantics:
 * - `undefined` = no local value set, use default (show badge)
 * - `''` (empty string) = user explicitly cleared, show empty (no badge)
 * - `'value'` = user set a value, show it (no badge)
 *
 * @param localValue - The current local/settings value (may be undefined)
 * @param defaultValue - The fallback value from shot defaults
 * @param hasDbOverride - Whether there's a saved override in the database (optional)
 */
export function getDefaultableField(
  localValue: string | undefined,
  defaultValue: string | undefined,
  hasDbOverride?: boolean
): DefaultableFieldResult {
  // Key insight: check for `undefined` specifically, not falsiness
  // Empty string '' means user explicitly cleared - don't show default
  const isUsingDefault = localValue === undefined && (
    hasDbOverride !== undefined
      ? !hasDbOverride && defaultValue !== undefined
      : defaultValue !== undefined
  );

  return {
    isUsingDefault,
    displayValue: isUsingDefault ? (defaultValue ?? '') : (localValue ?? ''),
  };
}

/**
 * Detect generation mode from model name.
 */
export function detectGenerationMode(modelName?: string): 'i2v' | 'vace' {
  if (!modelName) return 'i2v';
  return modelName.toLowerCase().includes('vace') ? 'vace' : 'i2v';
}

// =============================================================================
// CONTROLLED FORM INTERFACE
// =============================================================================

/**
 * Complete segment settings for the controlled form.
 * This is the single source of truth passed to SegmentSettingsForm.
 */
export interface SegmentSettings {
  // Prompts
  prompt: string;
  negativePrompt: string;
  // Text before/after prompts (merged into final prompt when generating)
  textBeforePrompts?: string;
  textAfterPrompts?: string;
  // Motion
  motionMode: 'basic' | 'advanced';
  amountOfMotion: number; // 0-100 (UI scale)
  // Phase config (only when motionMode is advanced)
  phaseConfig: PhaseConfig | undefined;
  selectedPhasePresetId: string | null;
  // LoRAs
  loras: ActiveLora[];
  // Video settings
  numFrames: number;
  randomSeed: boolean;
  seed?: number;
  // Variant behavior
  makePrimaryVariant: boolean;
  // Structure video overrides (only when segment has structure video)
  structureMotionStrength?: number; // 0-2 scale
  structureTreatment?: 'adjust' | 'clip';
  structureUni3cEndPercent?: number; // 0-1 scale
}

/**
 * Create default segment settings.
 * @internal Used only within this module.
 */
function createDefaultSettings(defaults?: {
  prompt?: string;
  negativePrompt?: string;
  numFrames?: number;
}): SegmentSettings {
  return {
    prompt: defaults?.prompt ?? '',
    negativePrompt: defaults?.negativePrompt ?? '',
    motionMode: 'basic',
    amountOfMotion: 50,
    phaseConfig: undefined,
    selectedPhasePresetId: null,
    loras: [],
    numFrames: defaults?.numFrames ?? 25,
    randomSeed: true,
    seed: undefined,
    makePrimaryVariant: false,
  };
}

/**
 * Convert MergedSegmentSettings to SegmentSettings for the form.
 * @internal Unused - kept for potential future use.
 */
function mergedToFormSettings(
  merged: MergedSegmentSettings,
  extras?: {
    numFrames?: number;
    randomSeed?: boolean;
    seed?: number;
    selectedPhasePresetId?: string | null;
    makePrimaryVariant?: boolean;
  }
): SegmentSettings {
  return {
    prompt: merged.prompt,
    negativePrompt: merged.negativePrompt,
    motionMode: merged.motionMode,
    amountOfMotion: Math.round(merged.amountOfMotion * 100), // Convert 0-1 to 0-100
    phaseConfig: merged.phaseConfig,
    selectedPhasePresetId: extras?.selectedPhasePresetId ?? null,
    loras: merged.loras,
    numFrames: extras?.numFrames ?? 25,
    randomSeed: extras?.randomSeed ?? true,
    seed: extras?.seed,
    makePrimaryVariant: extras?.makePrimaryVariant ?? false,
  };
}

// Keep for potential future use - referenced in docs
void mergedToFormSettings;

// =============================================================================
// DATA SOURCE TYPES
// =============================================================================

// Types for the settings sources
export interface PairMetadata {
  // NEW FORMAT: Segment overrides in nested structure
  segmentOverrides?: {
    prompt?: string;
    negativePrompt?: string;
    motionMode?: 'basic' | 'advanced';
    amountOfMotion?: number; // 0-100 scale
    phaseConfig?: PhaseConfig;
    selectedPhasePresetId?: string | null;
    loras?: Array<{ path: string; strength: number; id?: string; name?: string }>;
    numFrames?: number;
    randomSeed?: boolean;
    seed?: number;
  };
  // AI-generated prompt (not user settings, kept separate)
  enhanced_prompt?: string;
  // DEPRECATED: Old pair_* fields (kept for backward compatibility during migration)
  /** @deprecated Use segmentOverrides.prompt instead */
  pair_prompt?: string;
  /** @deprecated Use segmentOverrides.negativePrompt instead */
  pair_negative_prompt?: string;
  /** @deprecated Use segmentOverrides.phaseConfig instead */
  pair_phase_config?: PhaseConfig;
  /** @deprecated Use segmentOverrides.motionMode and segmentOverrides.amountOfMotion instead */
  pair_motion_settings?: {
    motion_mode?: 'basic' | 'advanced';
    amount_of_motion?: number;
  };
  /** @deprecated Use segmentOverrides.loras instead */
  pair_loras?: Array<{ path: string; strength: number }>;
  /** @deprecated Use segmentOverrides.numFrames instead */
  pair_num_frames?: number;
  /** @deprecated Use segmentOverrides.randomSeed instead */
  pair_random_seed?: boolean;
  /** @deprecated Use segmentOverrides.seed instead */
  pair_seed?: number;
  /** @deprecated Use segmentOverrides.selectedPhasePresetId instead */
  pair_selected_phase_preset_id?: string | null;
  // LEGACY: Very old format nested in user_overrides
  /** @deprecated Use segmentOverrides instead */
  user_overrides?: {
    phase_config?: PhaseConfig;
    motion_mode?: 'basic' | 'advanced';
    amount_of_motion?: number;
    additional_loras?: Record<string, number>;
    [key: string]: unknown;
  };
}

export interface ShotBatchSettings {
  amountOfMotion?: number;
  motionMode?: 'basic' | 'advanced';
  selectedLoras?: ActiveLora[];
  phaseConfig?: PhaseConfig;
  prompt?: string;
  negativePrompt?: string;
}

interface MergedSegmentSettings {
  // Prompts
  prompt: string;
  negativePrompt: string;
  // Motion
  motionMode: 'basic' | 'advanced';
  amountOfMotion: number;
  // Phase config (only when motionMode is advanced)
  phaseConfig: PhaseConfig | undefined;
  // LoRAs
  loras: ActiveLora[];
  // Source tracking (for debugging)
  sources: {
    prompt: 'pair' | 'batch' | 'default';
    motionMode: 'pair' | 'batch' | 'default';
    phaseConfig: 'pair' | 'batch' | 'none';
    loras: 'pair' | 'batch' | 'none';
  };
}

// Convert legacy loras format (object) to array format
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

// Convert pair_loras format to ActiveLora[]
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

// Convert ActiveLora[] to pair_loras format for saving
// @internal Unused - kept for potential future use
function lorasToSaveFormat(loras: ActiveLora[]): Array<{ path: string; strength: number }> {
  return loras.map((lora) => ({
    path: lora.path,
    strength: lora.strength,
  }));
}

// Keep for potential future use
void lorasToSaveFormat;

// Strip mode field from phase config (backend determines mode from model)
export function stripModeFromPhaseConfig(config: PhaseConfig): PhaseConfig {
  const { mode, ...rest } = config as PhaseConfig & { mode?: string };
  return rest as PhaseConfig;
}

/**
 * Merge segment settings from all sources with clear priority.
 *
 * Priority (highest to lowest):
 * 1. pairMetadata - Per-pair overrides from shot_generations.metadata
 * 2. shotBatchSettings - Shot-level defaults from shots.settings
 * 3. defaults - Hardcoded fallbacks
 *
 * Note: Shot settings inheritance (from previous shot) is handled separately
 * when a new shot is created - see shotSettingsInheritance.ts
 *
 * @internal Unused - kept for potential future use.
 */
function mergeSegmentSettings(
  pairMetadata: PairMetadata | null | undefined,
  shotBatchSettings: ShotBatchSettings | null | undefined,
  defaults: {
    prompt: string;
    negativePrompt: string;
  }
): MergedSegmentSettings {
  const sources: MergedSegmentSettings['sources'] = {
    prompt: 'default',
    motionMode: 'default',
    phaseConfig: 'none',
    loras: 'none',
  };

  // Use migration utility to read from new or old format
  const overrides = readSegmentOverrides(pairMetadata as Record<string, unknown> | null);

  // Legacy user_overrides for very old data fallback
  const legacyOverrides = (pairMetadata as PairMetadata | undefined)?.user_overrides || {} as NonNullable<PairMetadata['user_overrides']>;

  // enhanced_prompt is separate (AI-generated, not user settings)
  const enhancedPrompt = (pairMetadata as PairMetadata | undefined)?.enhanced_prompt;

  // Prompts: overrides.prompt > enhanced_prompt > batch > default
  // Note: empty string is a valid override (user explicitly cleared)
  let prompt = defaults.prompt;
  if (typeof overrides.prompt === 'string') {
    // User explicitly set a prompt (even if empty)
    prompt = overrides.prompt;
    sources.prompt = 'pair';
  } else if (enhancedPrompt) {
    // AI-generated prompt (fallback when no user override)
    prompt = enhancedPrompt;
    sources.prompt = 'pair';
  } else if (shotBatchSettings?.prompt) {
    prompt = shotBatchSettings.prompt;
    sources.prompt = 'batch';
  }

  // Negative prompt: overrides > batch > default
  let negativePrompt = defaults.negativePrompt;
  if (overrides.negativePrompt !== undefined) {
    negativePrompt = overrides.negativePrompt;
    sources.prompt = 'pair'; // Negative follows positive source for simplicity
  } else if (shotBatchSettings?.negativePrompt !== undefined) {
    negativePrompt = shotBatchSettings.negativePrompt;
  }

  // Motion mode: overrides > legacy > batch > default
  let motionMode: 'basic' | 'advanced' = 'basic';
  const pairMotionMode = (overrides.motionMode ?? legacyOverrides.motion_mode) as 'basic' | 'advanced' | undefined;
  if (pairMotionMode !== undefined) {
    motionMode = pairMotionMode;
    sources.motionMode = 'pair';
  } else if (shotBatchSettings?.motionMode !== undefined) {
    motionMode = shotBatchSettings.motionMode;
    sources.motionMode = 'batch';
  }

  // Amount of motion: overrides (0-100) > legacy (0-1) > batch (0-1) > default (0.5)
  // Note: overrides.amountOfMotion is already normalized to 0-100 by migration utility
  // We return 0-1 scale for backwards compatibility with callers
  let amountOfMotion = 0.5;
  if (overrides.amountOfMotion !== undefined) {
    amountOfMotion = overrides.amountOfMotion / 100; // Convert 0-100 to 0-1
  } else if (legacyOverrides.amount_of_motion !== undefined) {
    amountOfMotion = legacyOverrides.amount_of_motion as number;
  } else if (shotBatchSettings?.amountOfMotion !== undefined) {
    amountOfMotion = shotBatchSettings.amountOfMotion;
  }

  // Phase config: only when motion mode is advanced
  // overrides > legacy > batch > none
  let phaseConfig: PhaseConfig | undefined = undefined;
  if (motionMode === 'advanced') {
    const pairPhaseConfig = (overrides.phaseConfig ?? legacyOverrides.phase_config) as PhaseConfig | undefined;
    if (pairPhaseConfig) {
      phaseConfig = stripModeFromPhaseConfig(pairPhaseConfig);
      sources.phaseConfig = 'pair';
    } else if (shotBatchSettings?.phaseConfig) {
      phaseConfig = stripModeFromPhaseConfig(shotBatchSettings.phaseConfig);
      sources.phaseConfig = 'batch';
    }
  }
  // When in basic mode, phaseConfig is always undefined (invariant)

  // LoRAs: overrides > legacy > batch > none
  // Note: overrides.loras !== undefined means the user has explicitly set loras (even if empty array)
  let loras: ActiveLora[] = [];
  if (overrides.loras !== undefined) {
    // Segment has explicit lora override (could be empty array = "no loras")
    loras = overrides.loras.map((lora) => ({
      id: lora.id || lora.path,
      name: lora.name || lora.path.split('/').pop()?.replace('.safetensors', '') || lora.path,
      path: lora.path,
      strength: lora.strength,
    }));
    sources.loras = 'pair';
  } else if (legacyOverrides.additional_loras && Object.keys(legacyOverrides.additional_loras as Record<string, unknown>).length > 0) {
    loras = legacyLorasToArray(legacyOverrides.additional_loras as Record<string, number>);
    sources.loras = 'pair';
  } else if (shotBatchSettings?.selectedLoras && shotBatchSettings.selectedLoras.length > 0) {
    loras = shotBatchSettings.selectedLoras;
    sources.loras = 'batch';
  }

  return {
    prompt,
    negativePrompt,
    motionMode,
    amountOfMotion,
    phaseConfig,
    loras,
    sources,
  };
}

// Keep for potential future use
void mergeSegmentSettings;

/**
 * Build metadata update payload for saving pair settings.
 *
 * Uses the new format (pair_X fields at root level) and clears legacy fields.
 */
export interface PairSettingsToSave {
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

/**
 * Build task params from segment settings.
 * Used by parent components to create generation tasks.
 */
export function buildTaskParams(
  settings: SegmentSettings,
  context: {
    projectId: string;
    shotId?: string;
    generationId?: string;
    childGenerationId?: string;
    segmentIndex: number;
    startImageUrl: string;
    endImageUrl?: string; // Optional for trailing segments (single-image-to-video)
    startImageGenerationId?: string;
    endImageGenerationId?: string;
    pairShotGenerationId?: string;
    startImageVariantId?: string;
    endImageVariantId?: string;
    projectResolution?: string;
    // Optional enhanced prompt (AI-enhanced version, kept separate from base_prompt)
    enhancedPrompt?: string;
    // Structure video config for this segment (from shot timeline data)
    structureVideo?: StructureVideoConfig | null;
  }
): Record<string, unknown> {
  // Build structure_videos array if we have a structure video for this segment
  const structureVideos = context.structureVideo ? [context.structureVideo] : undefined;

  // Detect trailing segment: no end image means single-image-to-video (last segment)
  const isTrailingSegment = !context.endImageUrl;

  return {
    project_id: context.projectId,
    shot_id: context.shotId,
    parent_generation_id: context.generationId,
    child_generation_id: context.childGenerationId,
    segment_index: context.segmentIndex,
    start_image_url: context.startImageUrl,
    end_image_url: context.endImageUrl,
    // For trailing segments (no end image), mark as last segment so worker uses I2V mode
    is_last_segment: isTrailingSegment,
    start_image_generation_id: context.startImageGenerationId,
    end_image_generation_id: context.endImageGenerationId,
    pair_shot_generation_id: context.pairShotGenerationId,
    start_image_variant_id: context.startImageVariantId,
    end_image_variant_id: context.endImageVariantId,
    // Settings
    base_prompt: settings.prompt,
    negative_prompt: settings.negativePrompt,
    // Enhanced prompt (AI-enhanced version) - worker should prefer this over base_prompt when present
    ...(context.enhancedPrompt && { enhanced_prompt: context.enhancedPrompt }),
    num_frames: settings.numFrames,
    random_seed: settings.randomSeed,
    seed: settings.seed,
    amount_of_motion: settings.amountOfMotion / 100, // Convert 0-100 to 0-1
    motion_mode: settings.motionMode,
    phase_config: settings.motionMode === 'basic' && !settings.selectedPhasePresetId ? undefined : settings.phaseConfig,
    selected_phase_preset_id: settings.selectedPhasePresetId,
    loras: settings.loras.map(l => ({ path: l.path, strength: l.strength })),
    make_primary_variant: settings.makePrimaryVariant,
    // Resolution
    ...(context.projectResolution && { parsed_resolution_wh: context.projectResolution }),
    // Structure video (from shot timeline data)
    ...(structureVideos && { structure_videos: structureVideos }),
  };
}

/**
 * Extract SegmentSettings from variant/generation params.
 * Used to populate the form with settings from an existing generation.
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

export function buildMetadataUpdate(
  currentMetadata: Record<string, unknown>,
  settings: PairSettingsToSave
): Record<string, unknown> {

  // Convert PairSettingsToSave to SegmentOverrides format for new storage
  // Convention:
  //   undefined = don't touch this field (keep existing value)
  //   '' (empty) = explicitly clear the override (use shot default)
  //   'value' = set the override
  const overrides: SegmentOverrides = {};

  // Track fields that should be explicitly cleared (set to '' means remove override)
  const fieldsToClear: (keyof SegmentOverrides)[] = [];

  if (settings.prompt !== undefined) {
    if (settings.prompt === '') {
      fieldsToClear.push('prompt');
    } else {
      overrides.prompt = settings.prompt;
    }
  }
  if (settings.negativePrompt !== undefined) {
    if (settings.negativePrompt === '') {
      fieldsToClear.push('negativePrompt');
    } else {
      overrides.negativePrompt = settings.negativePrompt;
    }
  }
  if (settings.textBeforePrompts !== undefined) {
    if (settings.textBeforePrompts === '') {
      fieldsToClear.push('textBeforePrompts');
    } else {
      overrides.textBeforePrompts = settings.textBeforePrompts;
    }
  }
  if (settings.textAfterPrompts !== undefined) {
    if (settings.textAfterPrompts === '') {
      fieldsToClear.push('textAfterPrompts');
    } else {
      overrides.textAfterPrompts = settings.textAfterPrompts;
    }
  }
  // Motion settings: null = clear, undefined = don't touch, value = set
  if (settings.motionMode !== undefined) {
    if (settings.motionMode === null) {
      fieldsToClear.push('motionMode');
    } else {
      overrides.motionMode = settings.motionMode;
    }
  }
  if (settings.amountOfMotion !== undefined) {
    if (settings.amountOfMotion === null) {
      fieldsToClear.push('amountOfMotion');
    } else {
      // Store in 0-100 scale (UI scale) in new format
      overrides.amountOfMotion = settings.amountOfMotion;
    }
  }
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
      // Convert ActiveLora[] to LoraConfig[]
      overrides.loras = settings.loras.map((l): LoraConfig => ({
        id: l.id,
        name: l.name,
        path: l.path,
        strength: l.strength,
      }));
    }
  }
  // Note: numFrames is NOT saved - timeline positions are the source of truth
  if (settings.randomSeed !== undefined) {
    overrides.randomSeed = settings.randomSeed;
  }
  if (settings.seed !== undefined) {
    overrides.seed = settings.seed;
  }
  if (settings.selectedPhasePresetId !== undefined) {
    if (settings.selectedPhasePresetId === null) {
      fieldsToClear.push('selectedPhasePresetId');
    } else {
      overrides.selectedPhasePresetId = settings.selectedPhasePresetId;
    }
  }
  // Structure video overrides: null = clear, undefined = don't touch, value = set
  if (settings.structureMotionStrength !== undefined) {
    if (settings.structureMotionStrength === null) {
      fieldsToClear.push('structureMotionStrength');
    } else {
      overrides.structureMotionStrength = settings.structureMotionStrength;
    }
  }
  if (settings.structureTreatment !== undefined) {
    if (settings.structureTreatment === null) {
      fieldsToClear.push('structureTreatment');
    } else {
      overrides.structureTreatment = settings.structureTreatment;
    }
  }
  if (settings.structureUni3cEndPercent !== undefined) {
    if (settings.structureUni3cEndPercent === null) {
      fieldsToClear.push('structureUni3cEndPercent');
    } else {
      overrides.structureUni3cEndPercent = settings.structureUni3cEndPercent;
    }
  }

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

  // Handle explicitly cleared fields ('' means remove override, use shot default)
  if (fieldsToClear.length > 0 && segOverrides) {
    for (const field of fieldsToClear) {
      delete segOverrides[field];
    }
  }

  // Clean up old pair_* fields (migration cleanup)
  // These fields are now stored in segmentOverrides
  if (settings.prompt !== undefined) {
    delete newMetadata.pair_prompt;
  }
  if (settings.negativePrompt !== undefined) {
    delete newMetadata.pair_negative_prompt;
  }
  if (settings.motionMode !== undefined || settings.amountOfMotion !== undefined) {
    delete newMetadata.pair_motion_settings;
  }
  if (settings.phaseConfig !== undefined) {
    delete newMetadata.pair_phase_config;
  }
  if (settings.loras !== undefined) {
    delete newMetadata.pair_loras;
  }
  if (settings.randomSeed !== undefined) {
    delete newMetadata.pair_random_seed;
  }
  if (settings.seed !== undefined) {
    delete newMetadata.pair_seed;
  }
  if (settings.selectedPhasePresetId !== undefined) {
    delete newMetadata.pair_selected_phase_preset_id;
  }

  // Clean up legacy user_overrides if present
  const userOverrides = newMetadata.user_overrides as Record<string, unknown> | undefined;
  if (userOverrides) {
    if (settings.motionMode !== undefined) delete userOverrides.motion_mode;
    if (settings.amountOfMotion !== undefined) delete userOverrides.amount_of_motion;
    if (settings.phaseConfig !== undefined) delete userOverrides.phase_config;
    if (settings.loras !== undefined) delete userOverrides.additional_loras;

    // Clean up empty user_overrides
    if (Object.keys(userOverrides).length === 0) {
      delete newMetadata.user_overrides;
    }
  }

  return newMetadata;
}
