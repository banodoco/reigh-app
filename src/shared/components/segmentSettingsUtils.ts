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
 *
 * Migration/conversion layer (PairMetadata, buildMetadataUpdate,
 * extractSettingsFromParams) lives in segmentSettingsMigration.ts.
 */

import { PhaseConfig, DEFAULT_PHASE_CONFIG, DEFAULT_VACE_PHASE_CONFIG } from '@/shared/types/phaseConfig';
import type { ActiveLora } from '@/shared/hooks/useLoraManager';
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
interface DefaultableFieldResult {
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


// =============================================================================
// DATA SOURCE TYPES
// =============================================================================

export interface ShotBatchSettings {
  amountOfMotion?: number;
  motionMode?: 'basic' | 'advanced';
  selectedLoras?: ActiveLora[];
  phaseConfig?: PhaseConfig;
  prompt?: string;
  negativePrompt?: string;
}

// Strip mode field from phase config (backend determines mode from model)
export function stripModeFromPhaseConfig(config: PhaseConfig): PhaseConfig {
  const { mode, ...rest } = config as PhaseConfig & { mode?: string };
  return rest as PhaseConfig;
}

// =============================================================================
// TASK PARAMS BUILDER
// =============================================================================

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
