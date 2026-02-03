import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { usePersistentState } from '@/shared/hooks/usePersistentState';

// Import canonical types from single source of truth
import {
  type EditMode,
  type LoraMode,
  type QwenEditModel,
  type EditAdvancedSettings,
  type VideoEnhanceSettings,
  type GenerationEditSettings,
  type SyncedEditSettings,
  DEFAULT_EDIT_SETTINGS,
  DEFAULT_ADVANCED_SETTINGS,
  DEFAULT_ENHANCE_SETTINGS,
} from './editSettingsTypes';

// Re-export types for backwards compatibility
export type { EditMode, LoraMode, QwenEditModel, EditAdvancedSettings, VideoEnhanceSettings, GenerationEditSettings };
export { DEFAULT_EDIT_SETTINGS, DEFAULT_ADVANCED_SETTINGS, DEFAULT_ENHANCE_SETTINGS };

/**
 * Result type for convertToHiresFixApiParams - includes num_inference_steps for single-pass mode.
 */
export interface EditApiParams {
  num_inference_steps?: number;
  hires_scale?: number;
  hires_steps?: number;
  hires_denoise?: number;
  lightning_lora_strength_phase_1?: number;
  lightning_lora_strength_phase_2?: number;
}

/**
 * Converts EditAdvancedSettings to API params for task creation.
 * Returns hires params if two-pass is enabled, or just num_inference_steps if disabled.
 */
export function convertToHiresFixApiParams(settings: EditAdvancedSettings | undefined): EditApiParams | undefined {
  if (!settings) {
    return undefined;
  }

  if (!settings.enabled) {
    // Two-pass disabled: just return num_inference_steps for single-pass generation
    return {
      num_inference_steps: settings.num_inference_steps,
    };
  }

  // Two-pass enabled: return hires params (base_steps is used as num_inference_steps for phase 1)
  return {
    num_inference_steps: settings.base_steps,
    hires_scale: settings.hires_scale,
    hires_steps: settings.hires_steps,
    hires_denoise: settings.hires_denoise,
    lightning_lora_strength_phase_1: settings.lightning_lora_strength_phase_1,
    lightning_lora_strength_phase_2: settings.lightning_lora_strength_phase_2,
  };
}

export interface UseGenerationEditSettingsReturn {
  // Current settings
  settings: GenerationEditSettings;

  // Individual setters (trigger debounced save)
  setEditMode: (mode: EditMode) => void;
  setLoraMode: (mode: LoraMode) => void;
  setCustomLoraUrl: (url: string) => void;
  setNumGenerations: (num: number) => void;
  setPrompt: (prompt: string) => void;
  setQwenEditModel: (model: QwenEditModel) => void;
  // Img2Img setters
  setImg2imgPrompt: (prompt: string) => void;
  setImg2imgStrength: (strength: number) => void;
  setImg2imgEnablePromptExpansion: (enabled: boolean) => void;
  // Advanced settings setter
  setAdvancedSettings: (settings: Partial<EditAdvancedSettings>) => void;
  // Video enhance settings setter
  setEnhanceSettings: (settings: Partial<VideoEnhanceSettings>) => void;
  // Generation options setter
  setCreateAsGeneration: (value: boolean) => void;

  // Bulk update
  updateSettings: (updates: Partial<GenerationEditSettings>) => void;

  // State
  isLoading: boolean;
  hasPersistedSettings: boolean;

  // For initialization from "last used"
  initializeFromLastUsed: (lastUsed: SyncedEditSettings & { editMode: EditMode }) => void;
}

interface UseGenerationEditSettingsProps {
  generationId: string | null;
  enabled?: boolean;
}

/**
 * Load settings from generations.params.ui.editSettings
 */
async function loadGenerationSettings(generationId: string): Promise<GenerationEditSettings | null> {
  const { data, error } = await supabase
    .from('generations')
    .select('params')
    .eq('id', generationId)
    .maybeSingle();

  if (error) {
    console.warn('[useGenerationEditSettings] Load failed:', error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  const savedSettings = (data?.params as Record<string, unknown>)?.ui as Record<string, unknown> | undefined;
  const editSettings = savedSettings?.editSettings as Partial<GenerationEditSettings> | undefined;

  if (editSettings) {
    return {
      ...DEFAULT_EDIT_SETTINGS,
      ...editSettings,
    };
  }

  return null;
}

/**
 * Save settings to generations.params.ui.editSettings
 */
async function saveGenerationSettings(generationId: string, settings: GenerationEditSettings): Promise<void> {
  // Fetch current params to merge
  const { data: current, error: fetchError } = await supabase
    .from('generations')
    .select('params')
    .eq('id', generationId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Failed to fetch current params: ${fetchError.message}`);
  }

  if (!current) {
    // Generation was deleted, skip save
    return;
  }

  // Merge with existing params
  const currentParams = (current?.params || {}) as Record<string, unknown>;
  const currentUi = (currentParams.ui || {}) as Record<string, unknown>;
  const updatedParams = {
    ...currentParams,
    ui: {
      ...currentUi,
      editSettings: settings,
      // Also save editMode at top level for backwards compatibility
      editMode: settings.editMode,
    }
  };

  const { error: updateError } = await supabase
    .from('generations')
    .update({ params: updatedParams })
    .eq('id', generationId);

  if (updateError) {
    throw new Error(`Failed to save settings: ${updateError.message}`);
  }
}

/**
 * Hook for managing per-generation edit settings persistence
 *
 * Uses usePersistentState for the core persistence logic:
 * - Status machine (idle → loading → ready → saving)
 * - Debounced auto-save
 * - Pending refs protection
 * - Flush on unmount/entity change
 *
 * Saves to: generations.params.ui.editSettings
 */
export function useGenerationEditSettings({
  generationId,
  enabled = true,
}: UseGenerationEditSettingsProps): UseGenerationEditSettingsReturn {
  const queryClient = useQueryClient();

  // Use the base persistent state hook
  const {
    state: settings,
    status,
    hasPersistedData: hasPersistedSettings,
    updateField,
    updateFields,
    initializeFrom,
  } = usePersistentState<GenerationEditSettings>({
    entityId: generationId,
    load: loadGenerationSettings,
    save: saveGenerationSettings,
    defaults: DEFAULT_EDIT_SETTINGS,
    debounceMs: 500,
    enabled,
    debugTag: '[useGenerationEditSettings]',
    onFlush: (entityId) => {
      // Invalidate generation queries after flush
      queryClient.invalidateQueries({
        queryKey: queryKeys.generations.detail(entityId)
      });
    },
    onSaveSuccess: () => {
      if (generationId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.generations.detail(generationId)
        });
      }
    },
  });

  // Individual setters that delegate to updateField
  const setEditMode = useCallback((mode: EditMode) => {
    updateField('editMode', mode);
  }, [updateField]);

  const setLoraMode = useCallback((mode: LoraMode) => {
    updateField('loraMode', mode);
  }, [updateField]);

  const setCustomLoraUrl = useCallback((url: string) => {
    updateField('customLoraUrl', url);
  }, [updateField]);

  const setNumGenerations = useCallback((num: number) => {
    updateField('numGenerations', num);
  }, [updateField]);

  const setPrompt = useCallback((prompt: string) => {
    updateField('prompt', prompt);
  }, [updateField]);

  const setQwenEditModel = useCallback((model: QwenEditModel) => {
    updateField('qwenEditModel', model);
  }, [updateField]);

  const setImg2imgPrompt = useCallback((prompt: string) => {
    updateFields({ img2imgPrompt: prompt, img2imgPromptHasBeenSet: true });
  }, [updateFields]);

  const setImg2imgStrength = useCallback((strength: number) => {
    updateField('img2imgStrength', strength);
  }, [updateField]);

  const setImg2imgEnablePromptExpansion = useCallback((enabled: boolean) => {
    updateField('img2imgEnablePromptExpansion', enabled);
  }, [updateField]);

  // Advanced settings setter (merges with existing)
  const setAdvancedSettings = useCallback((updates: Partial<EditAdvancedSettings>) => {
    updateFields({
      advancedSettings: { ...settings.advancedSettings, ...updates },
    });
  }, [updateFields, settings.advancedSettings]);

  // Video enhance settings setter (merges with existing)
  const setEnhanceSettings = useCallback((updates: Partial<VideoEnhanceSettings>) => {
    updateFields({
      enhanceSettings: { ...settings.enhanceSettings, ...updates },
    });
  }, [updateFields, settings.enhanceSettings]);

  const setCreateAsGeneration = useCallback((value: boolean) => {
    updateField('createAsGeneration', value);
  }, [updateField]);

  // Bulk update
  const updateSettings = useCallback((updates: Partial<GenerationEditSettings>) => {
    updateFields(updates);
  }, [updateFields]);

  // Initialize from "last used" - wraps initializeFrom with prompt exclusion
  const initializeFromLastUsed = useCallback((lastUsed: SyncedEditSettings & { editMode: EditMode }) => {
    // Apply last used but never inherit prompts
    initializeFrom({
      ...lastUsed,
      prompt: '',
      img2imgPrompt: '',
      img2imgPromptHasBeenSet: false,
    });
  }, [initializeFrom]);

  return {
    settings,
    setEditMode,
    setLoraMode,
    setCustomLoraUrl,
    setNumGenerations,
    setPrompt,
    setQwenEditModel,
    setImg2imgPrompt,
    setImg2imgStrength,
    setImg2imgEnablePromptExpansion,
    setAdvancedSettings,
    setEnhanceSettings,
    setCreateAsGeneration,
    updateSettings,
    isLoading: status === 'loading' || status === 'idle',
    hasPersistedSettings,
    initializeFromLastUsed,
  };
}
