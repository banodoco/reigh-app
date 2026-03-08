import { useEffect, useRef, useMemo, useState, useCallback } from 'react';
import { useGenerationEditSettings } from '../useGenerationEditSettings';
import { useLastUsedEditSettings } from '../useLastUsedEditSettings';

// Import canonical types from single source of truth
import {
  type EditMode,
  type LoraMode,
  type QwenEditModel,
  type EditAdvancedSettings,
  type VideoEnhanceSettings,
  type GenerationEditSettings,
  type EditSettingsSetterMethods,
  type LastUsedEditSettings,
  type VideoEditSubMode,
  type PanelMode,
  DEFAULT_EDIT_SETTINGS,
  DEFAULT_ADVANCED_SETTINGS,
  DEFAULT_ENHANCE_SETTINGS,
} from '../../model/editSettingsTypes';
import { resolveEditModeLoras } from '@/domains/lora/lib/loraUtils';

interface UseEditSettingsPersistenceProps {
  generationId: string | null;
  projectId: string | null;
  enabled?: boolean;
}

interface UseEditSettingsPersistenceReturn extends EditSettingsSetterMethods {
  // Current settings values
  editMode: EditMode;
  loraMode: LoraMode;
  customLoraUrl: string;
  numGenerations: number;
  prompt: string;
  // Img2Img values
  img2imgPrompt: string;
  img2imgPromptHasBeenSet: boolean;
  img2imgStrength: number;
  img2imgEnablePromptExpansion: boolean;
  // Advanced settings for two-pass generation
  advancedSettings: EditAdvancedSettings;
  // Video enhance settings (interpolation/upscaling)
  enhanceSettings: VideoEnhanceSettings;
  // Model selection for cloud mode
  qwenEditModel: QwenEditModel;
  // Generation options
  createAsGeneration: boolean;

  // Video/Panel mode settings (persisted to "last used" only)
  videoEditSubMode: VideoEditSubMode;
  panelMode: PanelMode;
  setVideoEditSubMode: (mode: VideoEditSubMode) => void;
  setPanelMode: (mode: PanelMode) => void;

  // Computed LoRAs for task creation
  editModeLoras: Array<{ url: string; strength: number }> | undefined;

  // Legacy compatibility
  isInSceneBoostEnabled: boolean;
  setIsInSceneBoostEnabled: (enabled: boolean) => void;

  // State
  isLoading: boolean;
  isReady: boolean; // True when initialization is complete
  hasPersistedSettings: boolean;
}

/**
 * Unified edit settings persistence hook
 *
 * Coordinates:
 * 1. Per-generation settings (generations.params.ui.editSettings)
 * 2. "Last used" settings (useToolSettings + localStorage)
 *
 * Loading behavior:
 * - If generation has persisted settings → use those (including prompt)
 * - If no persisted settings → use "last used" (prompt = '')
 *
 * Saving behavior:
 * - All changes save to generation
 * - Non-prompt changes also update "last used"
 */
export function useEditSettingsPersistence({
  generationId,
  projectId,
  enabled = true,
}: UseEditSettingsPersistenceProps): UseEditSettingsPersistenceReturn {
  // Per-generation settings
  const generationSettings = useGenerationEditSettings({
    generationId,
    enabled,
  });

  // "Last used" settings
  const lastUsedSettings = useLastUsedEditSettings({
    projectId,
    enabled,
  });

  // Track initialization state
  const hasInitializedRef = useRef(false);
  const lastGenerationIdRef = useRef<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Reset initialization on generation change
  useEffect(() => {
    if (generationId !== lastGenerationIdRef.current) {
      hasInitializedRef.current = false;
      lastGenerationIdRef.current = generationId;
      setIsReady(false);
    }
  }, [generationId]);

  // Extract stable references for the initialization effect
  const { isLoading: genIsLoading, hasPersistedSettings, initializeFromLastUsed } = generationSettings;
  const { lastUsed } = lastUsedSettings;

  // Initialize from "last used" when generation loads without persisted settings
  useEffect(() => {
    if (!genIsLoading && !hasInitializedRef.current && !hasPersistedSettings && generationId) {
      hasInitializedRef.current = true;
      // Apply "last used" settings (without prompt)
      initializeFromLastUsed(lastUsed);
      setIsReady(true);
    } else if (!genIsLoading && !hasInitializedRef.current && hasPersistedSettings) {
      hasInitializedRef.current = true;
      setIsReady(true);
    }
  }, [generationId, genIsLoading, hasPersistedSettings, initializeFromLastUsed, lastUsed]);

  // Compute effective values
  // editMode is ALWAYS from lastUsed (user-level, not per-generation) so it stays consistent across images/videos
  // Other settings like prompt, loraMode are per-generation
  const effectiveSettings = useMemo(() => {
    if (generationSettings.isLoading) {
      // Still loading, use defaults but editMode from lastUsed
      return {
        ...DEFAULT_EDIT_SETTINGS,
        editMode: lastUsedSettings.lastUsed.editMode,
      };
    }

    if (generationSettings.hasPersistedSettings) {
      // Has persisted settings, use them BUT override editMode with lastUsed (user-level)
      return {
        ...generationSettings.settings,
        editMode: lastUsedSettings.lastUsed.editMode,
      };
    }

    // No persisted settings yet.
    // Before the coordinator finishes initialization, we use lastUsed as defaults.
    // After initialization, always prefer the live generationSettings state so controls
    // (like the Img2Img strength slider) never feel "locked" while the debounced save runs.
    if (!isReady) {
      return {
        editMode: lastUsedSettings.lastUsed.editMode,
        loraMode: lastUsedSettings.lastUsed.loraMode,
        customLoraUrl: lastUsedSettings.lastUsed.customLoraUrl,
        numGenerations: lastUsedSettings.lastUsed.numGenerations,
        prompt: generationSettings.settings.prompt || '',
        img2imgPrompt: generationSettings.settings.img2imgPrompt || '',
        img2imgPromptHasBeenSet: generationSettings.settings.img2imgPromptHasBeenSet || false,
        img2imgStrength: lastUsedSettings.lastUsed.img2imgStrength,
        img2imgEnablePromptExpansion: lastUsedSettings.lastUsed.img2imgEnablePromptExpansion,
        advancedSettings: lastUsedSettings.lastUsed.advancedSettings ?? DEFAULT_ADVANCED_SETTINGS,
        enhanceSettings: generationSettings.settings.enhanceSettings ?? DEFAULT_ENHANCE_SETTINGS,
        qwenEditModel: generationSettings.settings.qwenEditModel ?? DEFAULT_EDIT_SETTINGS.qwenEditModel,
        createAsGeneration: lastUsedSettings.lastUsed.createAsGeneration,
      };
    }

    // Initialized: use the live per-generation state BUT override editMode with lastUsed (user-level)
    return {
      ...generationSettings.settings,
      editMode: lastUsedSettings.lastUsed.editMode,
    };
  }, [
    isReady,
    generationSettings.isLoading,
    generationSettings.hasPersistedSettings,
    generationSettings.settings,
    lastUsedSettings.lastUsed,
  ]);

  // Extract stable function references to avoid recreating callbacks on every render
  // (the parent objects are recreated each render, but these functions are stable)
  const { updateLastUsed } = lastUsedSettings;
  const {
    setLoraMode: genSetLoraMode,
    setCustomLoraUrl: genSetCustomLoraUrl,
    setNumGenerations: genSetNumGenerations,
    setPrompt: genSetPrompt,
    setQwenEditModel: genSetQwenEditModel,
    setImg2imgPrompt: genSetImg2imgPrompt,
    setImg2imgStrength: genSetImg2imgStrength,
    setImg2imgEnablePromptExpansion: genSetImg2imgEnablePromptExpansion,
    setAdvancedSettings: genSetAdvancedSettings,
    setEnhanceSettings: genSetEnhanceSettings,
    setCreateAsGeneration: genSetCreateAsGeneration,
  } = generationSettings;

  // Wrapper setters that also update "last used" (except prompt)
  // editMode is user-level only (not per-generation) so it stays consistent across images/videos
  const setEditMode = useCallback((mode: EditMode) => {
    updateLastUsed({ editMode: mode });
  }, [updateLastUsed]);

  const setLoraMode = useCallback((mode: LoraMode) => {
    genSetLoraMode(mode);
    updateLastUsed({ loraMode: mode });
  }, [genSetLoraMode, updateLastUsed]);

  const setCustomLoraUrl = useCallback((url: string) => {
    genSetCustomLoraUrl(url);
    updateLastUsed({ customLoraUrl: url });
  }, [genSetCustomLoraUrl, updateLastUsed]);

  const setNumGenerations = useCallback((num: number) => {
    genSetNumGenerations(num);
    updateLastUsed({ numGenerations: num });
  }, [genSetNumGenerations, updateLastUsed]);

  // Prompt only saves to generation (never to "last used")
  const setPrompt = useCallback((prompt: string) => {
    genSetPrompt(prompt);
  }, [genSetPrompt]);

  // Model selection (saves to generation, cloud mode only)
  const setQwenEditModel = useCallback((model: QwenEditModel) => {
    genSetQwenEditModel(model);
  }, [genSetQwenEditModel]);

  // Img2Img prompt only saves to generation (never to "last used")
  const setImg2imgPrompt = useCallback((prompt: string) => {
    genSetImg2imgPrompt(prompt);
  }, [genSetImg2imgPrompt]);

  // Img2Img setters (save to both generation and "last used")
  const setImg2imgStrength = useCallback((strength: number) => {
    genSetImg2imgStrength(strength);
    updateLastUsed({ img2imgStrength: strength });
  }, [genSetImg2imgStrength, updateLastUsed]);

  const setImg2imgEnablePromptExpansion = useCallback((enabled: boolean) => {
    genSetImg2imgEnablePromptExpansion(enabled);
    updateLastUsed({ img2imgEnablePromptExpansion: enabled });
  }, [genSetImg2imgEnablePromptExpansion, updateLastUsed]);

  // Advanced settings setter (merges with existing, saves to both generation and "last used")
  const setAdvancedSettings = useCallback((updates: Partial<EditAdvancedSettings>) => {
    genSetAdvancedSettings(updates);
    // Merge updates with current advancedSettings for lastUsed
    const currentAdvanced = effectiveSettings.advancedSettings ?? DEFAULT_ADVANCED_SETTINGS;
    updateLastUsed({ advancedSettings: { ...currentAdvanced, ...updates } });
  }, [genSetAdvancedSettings, updateLastUsed, effectiveSettings.advancedSettings]);

  // Video enhance settings setter (per-generation only, not "last used")
  const setEnhanceSettings = useCallback((updates: Partial<VideoEnhanceSettings>) => {
    genSetEnhanceSettings(updates);
  }, [genSetEnhanceSettings]);

  // Generation options setter (saves to both generation and "last used")
  const setCreateAsGeneration = useCallback((value: boolean) => {
    genSetCreateAsGeneration(value);
    updateLastUsed({ createAsGeneration: value });
  }, [genSetCreateAsGeneration, updateLastUsed]);

  // Video/Panel mode setters (only save to "last used", not per-generation)
  const setVideoEditSubMode = useCallback((mode: VideoEditSubMode) => {
    updateLastUsed({ videoEditSubMode: mode });
  }, [updateLastUsed]);

  const setPanelMode = useCallback((mode: PanelMode) => {
    updateLastUsed({ panelMode: mode });
  }, [updateLastUsed]);

  // Computed LoRAs based on mode (replaces useEditModeLoras logic)
  const loraMode = effectiveSettings.loraMode;
  const customLoraUrl = effectiveSettings.customLoraUrl;
  const editModeLoras = useMemo(
    () => resolveEditModeLoras(loraMode, customLoraUrl),
    [loraMode, customLoraUrl],
  );

  // Legacy compatibility
  const isInSceneBoostEnabled = effectiveSettings.loraMode !== 'none';
  const setIsInSceneBoostEnabled = (enabled: boolean) => {
    setLoraMode(enabled ? 'in-scene' : 'none');
  };

  return {
    // Current values (using effective settings to avoid race condition)
    editMode: effectiveSettings.editMode,
    loraMode: effectiveSettings.loraMode,
    customLoraUrl: effectiveSettings.customLoraUrl,
    numGenerations: effectiveSettings.numGenerations,
    prompt: effectiveSettings.prompt,
    // Img2Img values
    img2imgPrompt: effectiveSettings.img2imgPrompt,
    img2imgPromptHasBeenSet: effectiveSettings.img2imgPromptHasBeenSet,
    img2imgStrength: effectiveSettings.img2imgStrength,
    img2imgEnablePromptExpansion: effectiveSettings.img2imgEnablePromptExpansion,
    // Advanced settings (hires fix config)
    advancedSettings: effectiveSettings.advancedSettings ?? DEFAULT_ADVANCED_SETTINGS,
    // Video enhance settings (interpolation/upscaling)
    enhanceSettings: effectiveSettings.enhanceSettings ?? DEFAULT_ENHANCE_SETTINGS,
    // Model selection for cloud mode
    qwenEditModel: effectiveSettings.qwenEditModel ?? 'qwen-edit',
    // Generation options
    createAsGeneration: effectiveSettings.createAsGeneration ?? false,

    // Setters
    setEditMode,
    setLoraMode,
    setCustomLoraUrl,
    setNumGenerations,
    setPrompt,
    setQwenEditModel,
    // Img2Img setters
    setImg2imgPrompt,
    setImg2imgStrength,
    setImg2imgEnablePromptExpansion,
    // Advanced settings setter
    setAdvancedSettings,
    // Video enhance settings setter
    setEnhanceSettings,
    // Generation options setter
    setCreateAsGeneration,

    // Video/Panel mode (from "last used")
    videoEditSubMode: lastUsedSettings.lastUsed.videoEditSubMode,
    panelMode: lastUsedSettings.lastUsed.panelMode,
    setVideoEditSubMode,
    setPanelMode,

    // Computed
    editModeLoras,

    // Legacy
    isInSceneBoostEnabled,
    setIsInSceneBoostEnabled,

    // State
    isLoading: generationSettings.isLoading,
    isReady,
    hasPersistedSettings: generationSettings.hasPersistedSettings,
  };
}

// Re-export types for convenience
export type { EditMode, LoraMode, QwenEditModel, EditAdvancedSettings, VideoEnhanceSettings, GenerationEditSettings, LastUsedEditSettings, VideoEditSubMode, PanelMode };
