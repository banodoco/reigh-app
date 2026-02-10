/**
 * useGenerationSource - Manages generation source and model selection
 *
 * Handles:
 * - Generation source toggle (by-reference vs just-text)
 * - Text model selection
 * - Model override for optimistic UI
 * - LORA category swapping when changing modes
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { QueryClient } from '@tanstack/react-query';
import { handleError } from '@/shared/lib/errorHandler';
import { updateSettingsCache } from '@/shared/hooks/useToolSettings';
import { queryKeys } from '@/shared/lib/queryKeys';
import type { ActiveLora } from '@/shared/components/ActiveLoRAsDisplay';
import {
  GenerationSource,
  TextToImageModel,
  GenerationMode,
  LoraCategory,
  ProjectImageSettings,
  getLoraCategoryForModel,
  getHiresFixDefaultsForModel,
  HiresFixConfig,
} from '../types';

// ============================================================================
// Types
// ============================================================================

export interface UseGenerationSourceProps {
  selectedProjectId: string | undefined;
  projectImageSettings: ProjectImageSettings | undefined;
  isLoadingProjectSettings: boolean;
  updateProjectImageSettings: (scope: 'project' | 'shot', updates: Partial<ProjectImageSettings>) => Promise<void>;
  markAsInteracted: () => void;
  // LORA manager for category swapping
  loraManager: {
    selectedLoras: ActiveLora[];
    setSelectedLoras: (loras: ActiveLora[]) => void;
  };
  // Callback for hires fix defaults
  setHiresFixConfig: React.Dispatch<React.SetStateAction<HiresFixConfig | Partial<HiresFixConfig>>>;
  // Callback for model change (used by model selector)
  queryClient?: QueryClient;
}

export interface UseGenerationSourceReturn {
  // State
  generationSource: GenerationSource;
  selectedTextModel: TextToImageModel;
  modelOverride: GenerationMode | undefined;

  // Refs for stale closure prevention
  generationSourceRef: React.MutableRefObject<GenerationSource>;
  selectedTextModelRef: React.MutableRefObject<TextToImageModel>;

  // Handlers
  handleGenerationSourceChange: (source: GenerationSource) => Promise<void>;
  handleTextModelChange: (model: TextToImageModel) => Promise<void>;
  handleModelChange: (value: GenerationMode) => Promise<void>;

  // State setters
  setGenerationSource: React.Dispatch<React.SetStateAction<GenerationSource>>;
  setSelectedTextModel: React.Dispatch<React.SetStateAction<TextToImageModel>>;
  setModelOverride: React.Dispatch<React.SetStateAction<GenerationMode | undefined>>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useGenerationSource(props: UseGenerationSourceProps): UseGenerationSourceReturn {
  const {
    selectedProjectId,
    projectImageSettings,
    isLoadingProjectSettings,
    updateProjectImageSettings,
    markAsInteracted,
    loraManager,
    setHiresFixConfig,
    queryClient,
  } = props;

  // ============================================================================
  // State
  // ============================================================================

  const [generationSource, setGenerationSource] = useState<GenerationSource>('by-reference');
  const [selectedTextModel, setSelectedTextModel] = useState<TextToImageModel>('qwen-image');
  const [modelOverride, setModelOverride] = useState<GenerationMode | undefined>(undefined);

  // Refs to track current values - prevents stale closure issues in callbacks
  const generationSourceRef = useRef<GenerationSource>(generationSource);
  const selectedTextModelRef = useRef<TextToImageModel>(selectedTextModel);

  useEffect(() => { generationSourceRef.current = generationSource; }, [generationSource]);
  useEffect(() => { selectedTextModelRef.current = selectedTextModel; }, [selectedTextModel]);

  // Track initialization
  const hasInitializedGenerationSource = useRef(false);
  const initializedTextModelRef = useRef<TextToImageModel | null>(null);

  // ============================================================================
  // Initialization from Project Settings
  // ============================================================================

  useEffect(() => {
    if (isLoadingProjectSettings) return;
    if (hasInitializedGenerationSource.current) return;
    if (!projectImageSettings) return;

    if (projectImageSettings.generationSource) {
      setGenerationSource(projectImageSettings.generationSource);
    }
    const textModel = projectImageSettings.selectedTextModel || 'qwen-image';
    if (projectImageSettings.selectedTextModel) {
      setSelectedTextModel(projectImageSettings.selectedTextModel);
    }
    initializedTextModelRef.current = textModel;
    hasInitializedGenerationSource.current = true;
  }, [projectImageSettings, isLoadingProjectSettings]);

  // Clear model override once server settings reflect the change
  useEffect(() => {
    if (modelOverride && projectImageSettings?.selectedModel === modelOverride) {
      setModelOverride(undefined);
    }
  }, [projectImageSettings?.selectedModel, modelOverride]);

  // ============================================================================
  // Handler: Generation Source Change
  // ============================================================================

  const handleGenerationSourceChange = useCallback(async (source: GenerationSource) => {
    const previousSource = generationSource;
    setGenerationSource(source);
    markAsInteracted();

    // Apply model-specific hires fix defaults when switching modes
    const modelName = source === 'by-reference' ? 'qwen-image' : selectedTextModel;
    setHiresFixConfig(getHiresFixDefaultsForModel(modelName));

    // Determine categories for LORA swapping
    const previousCategory: LoraCategory = previousSource === 'by-reference' ? 'qwen' : getLoraCategoryForModel(selectedTextModel);
    const newCategory: LoraCategory = source === 'by-reference' ? 'qwen' : getLoraCategoryForModel(selectedTextModel);

    // Only swap LORAs if changing categories
    if (previousCategory !== newCategory) {
      const currentLorasByCategory = projectImageSettings?.selectedLorasByCategory ?? {
        'qwen': [],
        'z-image': [],
      };

      // Save current LORAs to the previous category's slot
      const updatedLorasByCategory = {
        ...currentLorasByCategory,
        [previousCategory]: loraManager.selectedLoras,
      };

      // Load LORAs for the new category
      const newCategoryLoras = currentLorasByCategory[newCategory] ?? [];
      loraManager.setSelectedLoras(newCategoryLoras);

      try {
        await updateProjectImageSettings('project', {
          generationSource: source,
          selectedLorasByCategory: updatedLorasByCategory,
        });
      } catch (error) {
        handleError(error, { context: 'useGenerationSource.handleGenerationSourceChange', showToast: false });
      }
    } else {
      try {
        await updateProjectImageSettings('project', { generationSource: source });
      } catch (error) {
        handleError(error, { context: 'useGenerationSource.handleGenerationSourceChange', showToast: false });
      }
    }
  }, [updateProjectImageSettings, markAsInteracted, selectedTextModel, generationSource, projectImageSettings?.selectedLorasByCategory, loraManager, setHiresFixConfig]);

  // ============================================================================
  // Handler: Text Model Change
  // ============================================================================

  const handleTextModelChange = useCallback(async (model: TextToImageModel) => {
    const previousModel = selectedTextModel;
    const previousCategory = getLoraCategoryForModel(previousModel);
    const newCategory = getLoraCategoryForModel(model);

    setSelectedTextModel(model);
    markAsInteracted();

    // Apply model-specific hires fix defaults
    setHiresFixConfig(getHiresFixDefaultsForModel(model));

    // Only swap LORAs if changing categories (qwen ↔ z-image)
    if (previousCategory !== newCategory) {
      const currentLorasByCategory = projectImageSettings?.selectedLorasByCategory ?? {
        'qwen': [],
        'z-image': [],
      };

      // Save current LORAs to the previous category's slot
      const updatedLorasByCategory = {
        ...currentLorasByCategory,
        [previousCategory]: loraManager.selectedLoras,
      };

      // Load LORAs for the new category
      const newCategoryLoras = currentLorasByCategory[newCategory] ?? [];
      loraManager.setSelectedLoras(newCategoryLoras);

      try {
        await updateProjectImageSettings('project', {
          selectedTextModel: model,
          selectedLorasByCategory: updatedLorasByCategory,
        });
      } catch (error) {
        handleError(error, { context: 'useGenerationSource.handleTextModelChange', showToast: false });
      }
    } else {
      try {
        await updateProjectImageSettings('project', { selectedTextModel: model });
      } catch (error) {
        handleError(error, { context: 'useGenerationSource.handleTextModelChange', showToast: false });
      }
    }
  }, [updateProjectImageSettings, markAsInteracted, selectedTextModel, projectImageSettings?.selectedLorasByCategory, loraManager, setHiresFixConfig, generationSource]);

  // ============================================================================
  // Handler: Model Change (Legacy)
  // ============================================================================

  const handleModelChange = useCallback(async (value: GenerationMode) => {

    // Optimistic UI flip
    setModelOverride(value);

    // Optimistically update settings cache
    if (queryClient) {
      try {
        queryClient.setQueryData(queryKeys.settings.tool('project-image-settings', selectedProjectId, undefined), (prev: unknown) =>
          updateSettingsCache<ProjectImageSettings>(prev, { selectedModel: value })
        );
      } catch (e) {
      }
    }

    // Clear LoRAs when switching to Qwen.Image
    if (value === 'qwen-image') {
      loraManager.setSelectedLoras([]);
    }

    await updateProjectImageSettings('project', { selectedModel: value });
    markAsInteracted();
  }, [queryClient, selectedProjectId, loraManager, updateProjectImageSettings, markAsInteracted]);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    // State
    generationSource,
    selectedTextModel,
    modelOverride,

    // Refs
    generationSourceRef,
    selectedTextModelRef,

    // Handlers
    handleGenerationSourceChange,
    handleTextModelChange,
    handleModelChange,

    // State setters
    setGenerationSource,
    setSelectedTextModel,
    setModelOverride,
  };
}
