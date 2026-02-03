import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';

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
 * Hook for managing per-generation edit settings persistence
 *
 * Saves to: generations.params.ui.editSettings
 * Pattern: Similar to useShotGenerationMetadata but for generations table
 */
export function useGenerationEditSettings({
  generationId,
  enabled = true,
}: UseGenerationEditSettingsProps): UseGenerationEditSettingsReturn {
  const queryClient = useQueryClient();

  // Local state
  const [settings, setSettings] = useState<GenerationEditSettings>(DEFAULT_EDIT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [hasPersistedSettings, setHasPersistedSettings] = useState(false);

  // Track current generation to detect changes
  const currentGenerationIdRef = useRef<string | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef(false);
  const pendingInitFromLastUsedRef = useRef<(SyncedEditSettings & { editMode: EditMode }) | null>(null);

  // Load settings from database
  const loadSettings = useCallback(async (genId: string): Promise<GenerationEditSettings | null> => {
    try {
      console.log('[EDIT_DEBUG] 📥 LOAD: Fetching from generations.params.ui.editSettings');
      console.log('[EDIT_DEBUG] 📥 LOAD: generationId:', genId.substring(0, 8));

      const { data, error } = await supabase
        .from('generations')
        .select('params')
        .eq('id', genId)
        .maybeSingle();

      if (error) {
        console.warn('[EDIT_DEBUG] ❌ LOAD FAILED:', error.message);
        return null;
      }

      if (!data) {
        console.log('[EDIT_DEBUG] ⚠️ LOAD: Generation not found (may have been deleted)');
        return null;
      }

      const savedSettings = (data?.params as Record<string, unknown>)?.ui as Record<string, unknown> | undefined;
      const editSettings = savedSettings?.editSettings as Partial<GenerationEditSettings> | undefined;
      if (editSettings) {
        console.log('[EDIT_DEBUG] ✅ LOAD SUCCESS: Found persisted settings');
        console.log('[EDIT_DEBUG] ✅ LOAD: editMode:', editSettings.editMode);
        console.log('[EDIT_DEBUG] ✅ LOAD: loraMode:', editSettings.loraMode);
        console.log('[EDIT_DEBUG] ✅ LOAD: customLoraUrl:', editSettings.customLoraUrl || '(empty)');
        console.log('[EDIT_DEBUG] ✅ LOAD: numGenerations:', editSettings.numGenerations);
        console.log('[EDIT_DEBUG] ✅ LOAD: prompt:', editSettings.prompt ? `"${editSettings.prompt.substring(0, 50)}..."` : '(empty)');
        console.log('[EDIT_DEBUG] ✅ LOAD: img2imgPrompt:', editSettings.img2imgPrompt ? `"${editSettings.img2imgPrompt.substring(0, 50)}..."` : '(empty)');
        console.log('[EDIT_DEBUG] ✅ LOAD: img2imgPromptHasBeenSet:', !!editSettings.img2imgPromptHasBeenSet);
        return {
          ...DEFAULT_EDIT_SETTINGS,
          ...editSettings,
        };
      }

      console.log('[EDIT_DEBUG] ⚠️ LOAD: No persisted settings found for this generation');
      return null;
    } catch (err) {
      console.warn('[EDIT_DEBUG] ❌ LOAD ERROR:', err);
      return null;
    }
  }, []);

  // Save settings to database (debounced)
  const saveSettings = useCallback(async (genId: string, newSettings: GenerationEditSettings) => {
    try {
      console.log('[EDIT_DEBUG] 💾 SAVE: Persisting to generations.params.ui.editSettings');
      console.log('[EDIT_DEBUG] 💾 SAVE: generationId:', genId.substring(0, 8));
      console.log('[EDIT_DEBUG] 💾 SAVE: editMode:', newSettings.editMode);
      console.log('[EDIT_DEBUG] 💾 SAVE: loraMode:', newSettings.loraMode);
      console.log('[EDIT_DEBUG] 💾 SAVE: customLoraUrl:', newSettings.customLoraUrl || '(empty)');
      console.log('[EDIT_DEBUG] 💾 SAVE: numGenerations:', newSettings.numGenerations);
      console.log('[EDIT_DEBUG] 💾 SAVE: prompt:', newSettings.prompt ? `"${newSettings.prompt.substring(0, 50)}..."` : '(empty)');
      console.log('[EDIT_DEBUG] 💾 SAVE: img2imgPrompt:', newSettings.img2imgPrompt ? `"${newSettings.img2imgPrompt.substring(0, 50)}..."` : '(empty)');
      console.log('[EDIT_DEBUG] 💾 SAVE: img2imgPromptHasBeenSet:', newSettings.img2imgPromptHasBeenSet);
      console.log('[EDIT_DEBUG] 💾 SAVE: img2imgStrength:', newSettings.img2imgStrength);
      console.log('[EDIT_DEBUG] 💾 SAVE: img2imgEnablePromptExpansion:', newSettings.img2imgEnablePromptExpansion);

      // Fetch current params to merge
      const { data: current, error: fetchError } = await supabase
        .from('generations')
        .select('params')
        .eq('id', genId)
        .maybeSingle();

      if (fetchError) {
        console.warn('[EDIT_DEBUG] ❌ SAVE: Failed to fetch current params:', fetchError.message);
        return;
      }

      if (!current) {
        console.warn('[EDIT_DEBUG] ⚠️ SAVE: Generation not found (may have been deleted), skipping save');
        return;
      }

      // Merge with existing params
      const currentParams = (current?.params || {}) as Record<string, unknown>;
      const currentUi = (currentParams.ui || {}) as Record<string, unknown>;
      const updatedParams = {
        ...currentParams,
        ui: {
          ...currentUi,
          editSettings: newSettings,
          // Also save editMode at top level for backwards compatibility
          editMode: newSettings.editMode,
        }
      };

      const { error: updateError } = await supabase
        .from('generations')
        .update({ params: updatedParams })
        .eq('id', genId);

      if (updateError) {
        console.warn('[EDIT_DEBUG] ❌ SAVE FAILED:', updateError.message);
      } else {
        console.log('[EDIT_DEBUG] ✅ SAVE SUCCESS: Settings persisted to database');

        // Invalidate generation queries
        queryClient.invalidateQueries({
          queryKey: queryKeys.generations.detail(genId)
        });
      }
    } catch (err) {
      console.warn('[EDIT_DEBUG] ❌ SAVE ERROR:', err);
    }
  }, [queryClient]);

  // Debounced save trigger
  const triggerSave = useCallback((newSettings: GenerationEditSettings) => {
    if (!generationId || !isInitializedRef.current) return;

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Schedule debounced save
    saveTimeoutRef.current = setTimeout(() => {
      saveSettings(generationId, newSettings);
    }, 500); // 500ms debounce
  }, [generationId, saveSettings]);

  // Load on mount / generation change
  useEffect(() => {
    if (!enabled || !generationId) {
      setIsLoading(false);
      return;
    }

    // Detect generation change
    if (currentGenerationIdRef.current !== generationId) {
      console.log('[EDIT_DEBUG] 🔄 Generation changed - will load settings');
      console.log('[EDIT_DEBUG] 🔄 from:', currentGenerationIdRef.current?.substring(0, 8) || 'none');
      console.log('[EDIT_DEBUG] 🔄 to:', generationId.substring(0, 8));

      currentGenerationIdRef.current = generationId;
      isInitializedRef.current = false;
      setIsLoading(true);
      setHasPersistedSettings(false);

      // Clear pending save for old generation
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    }

    let cancelled = false;

    const load = async () => {
      const loaded = await loadSettings(generationId);

      if (cancelled) return;

      if (loaded) {
        setSettings(loaded);
        setHasPersistedSettings(true);
      } else {
        // No persisted settings - check if we have pending "last used" to apply
        if (pendingInitFromLastUsedRef.current) {
          console.log('[EDIT_DEBUG] 🔄 INIT: Applying pending "last used" settings (no persisted settings found)');
          console.log('[EDIT_DEBUG] 🔄 INIT: lastUsed.editMode:', pendingInitFromLastUsedRef.current.editMode);
          console.log('[EDIT_DEBUG] 🔄 INIT: lastUsed.loraMode:', pendingInitFromLastUsedRef.current.loraMode);
          setSettings({
            ...DEFAULT_EDIT_SETTINGS,
            ...pendingInitFromLastUsedRef.current,
            prompt: '', // Never inherit prompt
            img2imgPrompt: '', // Never inherit img2img prompt
            img2imgPromptHasBeenSet: false,
          });
          pendingInitFromLastUsedRef.current = null;
        } else {
          console.log('[EDIT_DEBUG] 🔄 INIT: Using defaults (no persisted or lastUsed settings)');
          setSettings(DEFAULT_EDIT_SETTINGS);
        }
        setHasPersistedSettings(false);
      }

      isInitializedRef.current = true;
      setIsLoading(false);
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [generationId, enabled, loadSettings]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Individual setters
  const setEditMode = useCallback((mode: EditMode) => {
    setSettings(prev => {
      const updated = { ...prev, editMode: mode };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);

  const setLoraMode = useCallback((mode: LoraMode) => {
    setSettings(prev => {
      const updated = { ...prev, loraMode: mode };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);

  const setCustomLoraUrl = useCallback((url: string) => {
    setSettings(prev => {
      const updated = { ...prev, customLoraUrl: url };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);

  const setNumGenerations = useCallback((num: number) => {
    setSettings(prev => {
      const updated = { ...prev, numGenerations: num };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);

  const setPrompt = useCallback((prompt: string) => {
    setSettings(prev => {
      const updated = { ...prev, prompt };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);

  const setQwenEditModel = useCallback((model: QwenEditModel) => {
    setSettings(prev => {
      const updated = { ...prev, qwenEditModel: model };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);

  // Img2Img setters
  const setImg2imgPrompt = useCallback((prompt: string) => {
    setSettings(prev => {
      const updated = { ...prev, img2imgPrompt: prompt, img2imgPromptHasBeenSet: true };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);

  const setImg2imgStrength = useCallback((strength: number) => {
    setSettings(prev => {
      const updated = { ...prev, img2imgStrength: strength };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);

  const setImg2imgEnablePromptExpansion = useCallback((enabled: boolean) => {
    setSettings(prev => {
      const updated = { ...prev, img2imgEnablePromptExpansion: enabled };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);

  // Advanced settings setter (merges with existing)
  const setAdvancedSettings = useCallback((updates: Partial<EditAdvancedSettings>) => {
    setSettings(prev => {
      const updated = {
        ...prev,
        advancedSettings: { ...prev.advancedSettings, ...updates },
      };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);

  // Video enhance settings setter (merges with existing)
  const setEnhanceSettings = useCallback((updates: Partial<VideoEnhanceSettings>) => {
    setSettings(prev => {
      const updated = {
        ...prev,
        enhanceSettings: { ...prev.enhanceSettings, ...updates },
      };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);

  // Generation options setter
  const setCreateAsGeneration = useCallback((value: boolean) => {
    setSettings(prev => {
      const updated = { ...prev, createAsGeneration: value };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);

  // Bulk update
  const updateSettings = useCallback((updates: Partial<GenerationEditSettings>) => {
    setSettings(prev => {
      const updated = { ...prev, ...updates };
      triggerSave(updated);
      return updated;
    });
  }, [triggerSave]);

  // Initialize from "last used" - called when generation has no persisted settings
  const initializeFromLastUsed = useCallback((lastUsed: SyncedEditSettings & { editMode: EditMode }) => {
    if (isLoading) {
      // Store for later application after load completes
      pendingInitFromLastUsedRef.current = lastUsed;
      console.log('[EDIT_DEBUG] ⏳ INIT: Queued "last used" settings for after load completes');
    } else if (!hasPersistedSettings) {
      // Apply immediately if we're loaded and have no persisted settings
      console.log('[EDIT_DEBUG] 🔄 INIT: Applying "last used" settings immediately');
      console.log('[EDIT_DEBUG] 🔄 INIT: lastUsed.editMode:', lastUsed.editMode);
      console.log('[EDIT_DEBUG] 🔄 INIT: lastUsed.loraMode:', lastUsed.loraMode);
      console.log('[EDIT_DEBUG] 🔄 INIT: lastUsed.numGenerations:', lastUsed.numGenerations);
      setSettings(prev => ({
        ...prev,
        ...lastUsed,
        prompt: '', // Never inherit prompt
        img2imgPrompt: '', // Never inherit img2img prompt
        img2imgPromptHasBeenSet: false,
      }));
    } else {
      console.log('[EDIT_DEBUG] ⏭️ INIT: Skipping "last used" - generation has persisted settings');
    }
  }, [isLoading, hasPersistedSettings]);

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
    isLoading,
    hasPersistedSettings,
    initializeFromLastUsed,
  };
}
