/**
 * useSegmentSettings - Composed hook for segment settings management
 *
 * Manages segment settings for video regeneration with:
 * - Data fetching (pair metadata, shot settings)
 * - Local editing with auto-save
 * - Settings merging (segment overrides > shot defaults)
 * - Override tracking
 * - Persistence operations
 *
 * This hook composes:
 * - usePairMetadata (query)
 * - useShotVideoSettings (query)
 * - useSegmentMutations (mutations)
 * - useServerForm (local state + auto-save)
 *
 * @example
 * ```tsx
 * const { settings, updateSettings, saveSettings, isDirty } = useSegmentSettings({
 *   pairShotGenerationId,
 *   shotId,
 *   defaults: { prompt: '', negativePrompt: '', numFrames: 25 },
 * });
 * ```
 */

import { useMemo, useCallback } from 'react';
import { useServerForm } from '../useServerForm';
import { usePairMetadata } from './usePairMetadata';
import { useShotVideoSettings } from './useShotVideoSettings';
import { useSegmentMutations } from './useSegmentMutations';
import { readSegmentOverrides } from '@/shared/lib/settingsMigration';
import type { SegmentSettings, ShotBatchSettings } from '@/shared/components/SegmentSettingsForm/segmentSettingsUtils';
import type { PairMetadata } from '@/shared/components/SegmentSettingsForm/segmentSettingsMigration';
import type { ShotVideoSettings } from '@/shared/lib/settingsMigration';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Segment settings with nullable fields for "clear override" semantics.
 *
 * When a field is `null`, it means "remove the segment-level override and
 * inherit from shot defaults". This is used by `createClearedSettings` and
 * consumed by `buildMetadataUpdate` which interprets null as "delete this key".
 *
 * At runtime, `getSettingsForTaskCreation` resolves nulls to shot defaults via `??`.
 */
type ClearableSegmentSettings = {
  [K in keyof SegmentSettings]: SegmentSettings[K] | null;
};

export interface UseSegmentSettingsOptions {
  /** Shot generation ID for pair-specific settings */
  pairShotGenerationId?: string | null;
  /** Shot ID for batch settings */
  shotId?: string | null;
  /** Default values (hardcoded fallbacks) */
  defaults: {
    prompt: string;
    negativePrompt: string;
    /** Frame count from timeline positions (source of truth) */
    numFrames?: number;
    /** Whether new generations should become primary variant */
    makePrimaryVariant?: boolean;
  };
  /** Structure video defaults for this segment */
  structureVideoDefaults?: {
    motionStrength: number;
    treatment: 'adjust' | 'clip';
    uni3cEndPercent: number;
  } | null;
  /** Callback to update structure video defaults */
  onUpdateStructureVideoDefaults?: (updates: {
    motionStrength?: number;
    treatment?: 'adjust' | 'clip';
    uni3cEndPercent?: number;
  }) => Promise<void>;
}

/** Tracks which fields have pair-level overrides */
interface FieldOverrides {
  prompt: boolean;
  negativePrompt: boolean;
  textBeforePrompts: boolean;
  textAfterPrompts: boolean;
  motionMode: boolean;
  amountOfMotion: boolean;
  phaseConfig: boolean;
  loras: boolean;
  selectedPhasePresetId: boolean;
  structureMotionStrength: boolean;
  structureTreatment: boolean;
  structureUni3cEndPercent: boolean;
}

/** Shot-level default values (for showing as placeholder) */
interface ShotDefaults {
  prompt: string;
  negativePrompt: string;
  motionMode: 'basic' | 'advanced';
  amountOfMotion: number;
  phaseConfig?: import('@/shared/types/phaseConfig').PhaseConfig;
  loras: import('@/shared/types/segmentSettings').LoraConfig[];
  selectedPhasePresetId: string | null;
  textBeforePrompts: string;
  textAfterPrompts: string;
}

interface UseSegmentSettingsReturn {
  /** Current settings (merged from all sources + user edits) */
  settings: SegmentSettings;
  /** Update settings (local state only) */
  updateSettings: (updates: Partial<SegmentSettings>) => void;
  /** Save current settings to database */
  saveSettings: () => Promise<boolean>;
  /** Reset to merged defaults (discards local edits) */
  resetSettings: () => Promise<void>;
  /** Save current settings as shot-level defaults */
  saveAsShotDefaults: () => Promise<boolean>;
  /** Save a single field's current value as shot default */
  saveFieldAsDefault: (field: keyof SegmentSettings, value: unknown) => Promise<boolean>;
  /** Get effective settings for task creation (settings merged with shot defaults) */
  getSettingsForTaskCreation: () => SegmentSettings;
  /** Whether data is still loading */
  isLoading: boolean;
  /** Whether user has made local edits */
  isDirty: boolean;
  /** Raw pair metadata (for debugging) */
  pairMetadata: PairMetadata | null;
  /** Raw shot batch settings (for debugging) */
  shotBatchSettings: ShotBatchSettings | null;
  /** Which fields have pair-level overrides */
  hasOverride: FieldOverrides | undefined;
  /** Shot-level default values (for showing as placeholder) */
  shotDefaults: ShotDefaults;
  /** AI-generated enhanced prompt */
  enhancedPrompt: string | undefined;
  /** Base prompt used for enhancement */
  basePromptForEnhancement: string | undefined;
  /** Clear the enhanced prompt */
  clearEnhancedPrompt: () => Promise<boolean>;
  /** User's enhance prompt preference */
  enhancePromptEnabled: boolean | undefined;
  /** Save enhance prompt preference */
  saveEnhancePromptEnabled: (enabled: boolean) => Promise<boolean>;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Detect which fields have segment-level overrides.
 */
function detectOverrides(
  pairMetadata: PairMetadata | null | undefined,
  localData: Partial<SegmentSettings> | null,
  isLoading: boolean
): FieldOverrides | undefined {
  if (isLoading) return undefined;

  const pairOverrides = readSegmentOverrides(pairMetadata as Record<string, unknown> | null);

  const hasFieldOverride = (field: string): boolean => {
    // Check local state first (for immediate UI feedback)
    if (localData !== null && field in localData) {
      return (localData as Record<string, unknown>)[field] !== undefined;
    }
    // Fall back to DB state
    return (pairOverrides as Record<string, unknown>)[field] !== undefined;
  };

  return {
    prompt: hasFieldOverride('prompt'),
    negativePrompt: hasFieldOverride('negativePrompt'),
    textBeforePrompts: hasFieldOverride('textBeforePrompts'),
    textAfterPrompts: hasFieldOverride('textAfterPrompts'),
    motionMode: hasFieldOverride('motionMode'),
    amountOfMotion: hasFieldOverride('amountOfMotion'),
    phaseConfig: hasFieldOverride('phaseConfig'),
    loras: hasFieldOverride('loras'),
    selectedPhasePresetId: hasFieldOverride('selectedPhasePresetId'),
    structureMotionStrength: hasFieldOverride('structureMotionStrength'),
    structureTreatment: hasFieldOverride('structureTreatment'),
    structureUni3cEndPercent: hasFieldOverride('structureUni3cEndPercent'),
  };
}

/**
 * Build merged settings from segment overrides only.
 * Returns settings with undefined for fields without overrides.
 */
function buildMergedSettings(
  pairMetadata: PairMetadata | null | undefined,
  defaults: UseSegmentSettingsOptions['defaults']
): SegmentSettings {
  const pairOverrides = readSegmentOverrides(pairMetadata as Record<string, unknown> | null);

  return {
    prompt: pairOverrides.prompt,
    negativePrompt: pairOverrides.negativePrompt,
    textBeforePrompts: pairOverrides.textBeforePrompts,
    textAfterPrompts: pairOverrides.textAfterPrompts,
    motionMode: pairOverrides.motionMode as 'basic' | 'advanced' | undefined,
    amountOfMotion: pairOverrides.amountOfMotion,
    phaseConfig: pairOverrides.phaseConfig,
    selectedPhasePresetId: pairOverrides.selectedPhasePresetId,
    loras: pairOverrides.loras,
    numFrames: defaults.numFrames ?? 25,
    randomSeed: pairOverrides.randomSeed ?? true,
    seed: pairOverrides.seed,
    makePrimaryVariant: defaults.makePrimaryVariant ?? true,
    structureMotionStrength: pairOverrides.structureMotionStrength,
    structureTreatment: pairOverrides.structureTreatment,
    structureUni3cEndPercent: pairOverrides.structureUni3cEndPercent,
  } as SegmentSettings;
}

/**
 * Build shot defaults object for display.
 */
function buildShotDefaults(shotSettings: ShotVideoSettings | null | undefined): ShotDefaults {
  return {
    prompt: shotSettings?.prompt || '',
    negativePrompt: shotSettings?.negativePrompt || '',
    motionMode: shotSettings?.motionMode || 'basic',
    amountOfMotion: shotSettings?.amountOfMotion ?? 50,
    phaseConfig: shotSettings?.phaseConfig,
    loras: shotSettings?.loras || [],
    selectedPhasePresetId: shotSettings?.selectedPhasePresetId ?? null,
    textBeforePrompts: shotSettings?.textBeforePrompts || '',
    textAfterPrompts: shotSettings?.textAfterPrompts || '',
  };
}

/**
 * Create cleared settings for reset operation.
 *
 * Returns settings with nullable fields where `null` means "clear the override
 * and inherit from shot defaults". The form's saveData and buildMetadataUpdate
 * handle null values by removing the corresponding keys from storage.
 */
function createClearedSettings(
  numFrames: number,
  makePrimaryVariant: boolean
): ClearableSegmentSettings {
  return {
    prompt: '',
    negativePrompt: '',
    textBeforePrompts: '',
    textAfterPrompts: '',
    motionMode: null,
    amountOfMotion: null,
    phaseConfig: null,
    selectedPhasePresetId: null,
    loras: null,
    numFrames,
    randomSeed: true,
    seed: null,
    makePrimaryVariant,
    structureMotionStrength: null,
    structureTreatment: null,
    structureUni3cEndPercent: null,
  };
}

// =============================================================================
// MAIN HOOK
// =============================================================================

export function useSegmentSettings({
  pairShotGenerationId,
  shotId,
  defaults,
  structureVideoDefaults,
  onUpdateStructureVideoDefaults,
}: UseSegmentSettingsOptions): UseSegmentSettingsReturn {
  // 1. Fetch server data
  const { data: pairMetadata, isLoading: loadingPair } = usePairMetadata(pairShotGenerationId);
  const { data: shotVideoSettings, isLoading: loadingShot } = useShotVideoSettings(shotId);

  // 2. Get mutations
  const mutations = useSegmentMutations({ pairShotGenerationId, shotId });

  // 3. Compute merged settings from server data
  const mergedSettings = useMemo(
    () => buildMergedSettings(pairMetadata, defaults),
    [pairMetadata, defaults]
  );

  // 4. Shot defaults for placeholders
  const shotDefaults = useMemo(
    () => buildShotDefaults(shotVideoSettings),
    [shotVideoSettings]
  );

  // 5. Use server form pattern for local edits + auto-save
  const form = useServerForm({
    serverData: mergedSettings,
    isLoading: loadingPair || loadingShot,
    toLocal: (server) => server,
    save: mutations.savePairMetadata,
    autoSaveMs: 500,
    contextKey: pairShotGenerationId || undefined,
    validate: (updates, current) => {
      // Enforce: basic mode without a preset = no phase config.
      // When a preset IS selected, its phaseConfig must be preserved.
      if (updates.motionMode === 'basic') {
        const hasPreset = updates.selectedPhasePresetId ?? current.selectedPhasePresetId;
        if (!hasPreset) {
          return { ...updates, phaseConfig: undefined };
        }
      }
      return updates;
    },
  });

  // 6. Compute overrides (considering local state for immediate UI feedback)
  const hasOverride = useMemo(
    () => detectOverrides(pairMetadata, form.localData, loadingPair),
    [pairMetadata, form.localData, loadingPair]
  );

  // 7. Reset settings (clear all overrides)
  const resetSettings = useCallback(async () => {
    const cleared = createClearedSettings(
      defaults.numFrames ?? 25,
      defaults.makePrimaryVariant ?? true
    );

    // Save cleared settings, then clear enhanced prompt.
    // ClearableSegmentSettings uses null to indicate "clear override" - the save
    // function interprets nulls correctly via buildMetadataUpdate.
    await form.saveData(cleared as SegmentSettings);
    await mutations.clearEnhancedPrompt();
    form.reset();
  }, [form, mutations, defaults]);

  // 8. Get effective settings for task creation (merges with shot defaults)
  const getSettingsForTaskCreation = useCallback((): SegmentSettings => {
    const currentSettings = form.data;
    return {
      prompt: currentSettings.prompt ?? shotDefaults.prompt,
      negativePrompt: currentSettings.negativePrompt ?? shotDefaults.negativePrompt,
      textBeforePrompts: currentSettings.textBeforePrompts ?? shotDefaults.textBeforePrompts,
      textAfterPrompts: currentSettings.textAfterPrompts ?? shotDefaults.textAfterPrompts,
      motionMode: currentSettings.motionMode ?? shotDefaults.motionMode,
      amountOfMotion: currentSettings.amountOfMotion ?? shotDefaults.amountOfMotion,
      phaseConfig: currentSettings.phaseConfig ?? shotDefaults.phaseConfig,
      selectedPhasePresetId: currentSettings.selectedPhasePresetId ?? shotDefaults.selectedPhasePresetId,
      loras: currentSettings.loras ?? shotDefaults.loras,
      numFrames: currentSettings.numFrames,
      randomSeed: currentSettings.randomSeed,
      seed: currentSettings.seed,
      makePrimaryVariant: currentSettings.makePrimaryVariant,
      structureMotionStrength: currentSettings.structureMotionStrength,
      structureTreatment: currentSettings.structureTreatment,
      structureUni3cEndPercent: currentSettings.structureUni3cEndPercent,
    };
  }, [form.data, shotDefaults]);

  // 9. Save as shot defaults with structure video handling
  const saveAsShotDefaults = useCallback(async (): Promise<boolean> => {
    const result = await mutations.saveAsShotDefaults(form.data, shotDefaults);

    if (result && onUpdateStructureVideoDefaults) {
      const hasStructureOverrides =
        form.data.structureMotionStrength !== undefined ||
        form.data.structureTreatment !== undefined ||
        form.data.structureUni3cEndPercent !== undefined;

      if (hasStructureOverrides) {
        await onUpdateStructureVideoDefaults({
          motionStrength:
            form.data.structureMotionStrength ?? structureVideoDefaults?.motionStrength,
          treatment: form.data.structureTreatment ?? structureVideoDefaults?.treatment,
          uni3cEndPercent:
            form.data.structureUni3cEndPercent ?? structureVideoDefaults?.uni3cEndPercent,
        });

        // Clear structure overrides from segment
        form.update({
          structureMotionStrength: undefined,
          structureTreatment: undefined,
          structureUni3cEndPercent: undefined,
        });
      }
    }

    return result;
  }, [form, mutations, shotDefaults, onUpdateStructureVideoDefaults, structureVideoDefaults]);

  // 9. Extract enhanced prompt from metadata
  const enhancedPrompt =
    ((pairMetadata as Record<string, unknown> | null)?.enhanced_prompt as string)?.trim() ||
    undefined;
  const basePromptForEnhancement =
    ((pairMetadata as Record<string, unknown> | null)?.base_prompt_for_enhancement as string)?.trim() ||
    undefined;
  const enhancePromptEnabled = (pairMetadata as Record<string, unknown> | null)
    ?.enhance_prompt_enabled as boolean | undefined;

  // 10. Convert shot settings to legacy ShotBatchSettings format for compatibility
  const shotBatchSettings = useMemo((): ShotBatchSettings | null => {
    if (!shotVideoSettings) return null;
    return {
      amountOfMotion: shotVideoSettings.amountOfMotion / 100,
      motionMode: shotVideoSettings.motionMode,
      selectedLoras: shotVideoSettings.loras,
      phaseConfig: shotVideoSettings.phaseConfig,
      prompt: shotVideoSettings.prompt,
      negativePrompt: shotVideoSettings.negativePrompt,
    };
  }, [shotVideoSettings]);

  return {
    // Form state
    settings: form.data,
    updateSettings: form.update,
    saveSettings: form.save,
    resetSettings,
    isDirty: form.isDirty,
    isLoading: form.isLoading,

    // Override tracking
    hasOverride,
    shotDefaults,

    // Shot-level operations
    saveAsShotDefaults,
    saveFieldAsDefault: mutations.saveFieldAsDefault,

    // Task creation
    getSettingsForTaskCreation,

    // Enhanced prompt
    enhancedPrompt,
    basePromptForEnhancement,
    clearEnhancedPrompt: mutations.clearEnhancedPrompt,
    enhancePromptEnabled,
    saveEnhancePromptEnabled: mutations.saveEnhancePromptEnabled,

    // For debugging/compatibility
    pairMetadata: pairMetadata ?? null,
    shotBatchSettings,
  };
}
