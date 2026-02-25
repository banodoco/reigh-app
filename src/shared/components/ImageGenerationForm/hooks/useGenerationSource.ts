/**
 * useGenerationSource - Manages generation source and model selection
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { ActiveLora } from '@/shared/types/lora';
import {
  GenerationSource,
  TextToImageModel,
  LoraCategory,
  ProjectImageSettings,
  getLoraCategoryForModel,
  getHiresFixDefaultsForModel,
  HiresFixConfig,
} from '../types';

interface UseGenerationSourceProps {
  projectImageSettings: ProjectImageSettings | undefined;
  isLoadingProjectSettings: boolean;
  updateProjectImageSettings: (
    scope: 'project' | 'shot',
    updates: Partial<ProjectImageSettings>
  ) => Promise<void>;
  markAsInteracted: () => void;
  loraManager: {
    selectedLoras: ActiveLora[];
    setSelectedLoras: (loras: ActiveLora[]) => void;
  };
  setHiresFixConfig: Dispatch<SetStateAction<HiresFixConfig | Partial<HiresFixConfig>>>;
}

interface UseGenerationSourceReturn {
  generationSource: GenerationSource;
  selectedTextModel: TextToImageModel;
  generationSourceRef: MutableRefObject<GenerationSource>;
  selectedTextModelRef: MutableRefObject<TextToImageModel>;
  handleGenerationSourceChange: (source: GenerationSource) => Promise<void>;
  handleTextModelChange: (model: TextToImageModel) => Promise<void>;
}

interface InitializationInput {
  projectImageSettings: ProjectImageSettings | undefined;
  isLoadingProjectSettings: boolean;
  generationSource: GenerationSource;
  selectedTextModel: TextToImageModel;
  setGenerationSource: Dispatch<SetStateAction<GenerationSource>>;
  setSelectedTextModel: Dispatch<SetStateAction<TextToImageModel>>;
  loraManager: UseGenerationSourceProps['loraManager'];
}

interface HandlersInput {
  updateProjectImageSettings: UseGenerationSourceProps['updateProjectImageSettings'];
  markAsInteracted: UseGenerationSourceProps['markAsInteracted'];
  setHiresFixConfig: UseGenerationSourceProps['setHiresFixConfig'];
  projectImageSettings: ProjectImageSettings | undefined;
  loraManager: UseGenerationSourceProps['loraManager'];
  generationSource: GenerationSource;
  selectedTextModel: TextToImageModel;
  setGenerationSource: Dispatch<SetStateAction<GenerationSource>>;
  setSelectedTextModel: Dispatch<SetStateAction<TextToImageModel>>;
}

function useSyncedRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef<T>(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

function useGenerationSourceInitialization(input: InitializationInput): void {
  const {
    projectImageSettings,
    isLoadingProjectSettings,
    generationSource,
    selectedTextModel,
    setGenerationSource,
    setSelectedTextModel,
    loraManager,
  } = input;

  const hasInitializedGenerationSource = useRef(false);
  const initializedTextModelRef = useRef<TextToImageModel | null>(null);
  const hasInitializedLoras = useRef(false);

  useEffect(() => {
    if (isLoadingProjectSettings || hasInitializedGenerationSource.current || !projectImageSettings) {
      return;
    }

    if (projectImageSettings.generationSource) {
      setGenerationSource(projectImageSettings.generationSource);
    }

    const textModel = projectImageSettings.selectedTextModel || 'qwen-image';
    if (projectImageSettings.selectedTextModel) {
      setSelectedTextModel(projectImageSettings.selectedTextModel);
    }

    initializedTextModelRef.current = textModel;
    hasInitializedGenerationSource.current = true;
  }, [projectImageSettings, isLoadingProjectSettings, setGenerationSource, setSelectedTextModel]);

  useEffect(() => {
    if (isLoadingProjectSettings || hasInitializedLoras.current) {
      return;
    }

    const textModel = initializedTextModelRef.current || selectedTextModel;
    const currentSource = projectImageSettings?.generationSource || generationSource;
    const category: LoraCategory =
      currentSource === 'by-reference' ? 'qwen' : getLoraCategoryForModel(textModel);

    let categoryLoras: ActiveLora[] = [];
    if (projectImageSettings?.selectedLorasByCategory) {
      categoryLoras = projectImageSettings.selectedLorasByCategory[category] ?? [];
    }

    if (categoryLoras.length > 0) {
      loraManager.setSelectedLoras(categoryLoras);
    }

    hasInitializedLoras.current = true;
  }, [
    projectImageSettings?.selectedLorasByCategory,
    projectImageSettings?.generationSource,
    isLoadingProjectSettings,
    loraManager,
    selectedTextModel,
    generationSource,
  ]);
}

function useGenerationSourceHandlers(input: HandlersInput) {
  const {
    updateProjectImageSettings,
    markAsInteracted,
    setHiresFixConfig,
    projectImageSettings,
    loraManager,
    generationSource,
    selectedTextModel,
    setGenerationSource,
    setSelectedTextModel,
  } = input;

  const handleGenerationSourceChange = useCallback(
    async (source: GenerationSource) => {
      const previousSource = generationSource;
      setGenerationSource(source);
      markAsInteracted();

      const modelName = source === 'by-reference' ? 'qwen-image' : selectedTextModel;
      setHiresFixConfig(getHiresFixDefaultsForModel(modelName));

      const previousCategory: LoraCategory =
        previousSource === 'by-reference' ? 'qwen' : getLoraCategoryForModel(selectedTextModel);
      const newCategory: LoraCategory =
        source === 'by-reference' ? 'qwen' : getLoraCategoryForModel(selectedTextModel);

      if (previousCategory !== newCategory) {
        const currentLorasByCategory = projectImageSettings?.selectedLorasByCategory ?? {
          qwen: [],
          'z-image': [],
        };

        const updatedLorasByCategory = {
          ...currentLorasByCategory,
          [previousCategory]: loraManager.selectedLoras,
        };

        const newCategoryLoras = currentLorasByCategory[newCategory] ?? [];
        loraManager.setSelectedLoras(newCategoryLoras);

        try {
          await updateProjectImageSettings('project', {
            generationSource: source,
            selectedLorasByCategory: updatedLorasByCategory,
          });
        } catch (error) {
          normalizeAndPresentError(error, {
            context: 'useGenerationSource.handleGenerationSourceChange',
            showToast: false,
          });
        }

        return;
      }

      try {
        await updateProjectImageSettings('project', { generationSource: source });
      } catch (error) {
        normalizeAndPresentError(error, {
          context: 'useGenerationSource.handleGenerationSourceChange',
          showToast: false,
        });
      }
    },
    [
      updateProjectImageSettings,
      markAsInteracted,
      setHiresFixConfig,
      projectImageSettings?.selectedLorasByCategory,
      loraManager,
      generationSource,
      selectedTextModel,
      setGenerationSource,
    ]
  );

  const handleTextModelChange = useCallback(
    async (model: TextToImageModel) => {
      const previousModel = selectedTextModel;
      const previousCategory = getLoraCategoryForModel(previousModel);
      const newCategory = getLoraCategoryForModel(model);

      setSelectedTextModel(model);
      markAsInteracted();
      setHiresFixConfig(getHiresFixDefaultsForModel(model));

      if (previousCategory !== newCategory) {
        const currentLorasByCategory = projectImageSettings?.selectedLorasByCategory ?? {
          qwen: [],
          'z-image': [],
        };

        const updatedLorasByCategory = {
          ...currentLorasByCategory,
          [previousCategory]: loraManager.selectedLoras,
        };

        const newCategoryLoras = currentLorasByCategory[newCategory] ?? [];
        loraManager.setSelectedLoras(newCategoryLoras);

        try {
          await updateProjectImageSettings('project', {
            selectedTextModel: model,
            selectedLorasByCategory: updatedLorasByCategory,
          });
        } catch (error) {
          normalizeAndPresentError(error, {
            context: 'useGenerationSource.handleTextModelChange',
            showToast: false,
          });
        }

        return;
      }

      try {
        await updateProjectImageSettings('project', { selectedTextModel: model });
      } catch (error) {
        normalizeAndPresentError(error, {
          context: 'useGenerationSource.handleTextModelChange',
          showToast: false,
        });
      }
    },
    [
      updateProjectImageSettings,
      markAsInteracted,
      setHiresFixConfig,
      projectImageSettings?.selectedLorasByCategory,
      loraManager,
      selectedTextModel,
      setSelectedTextModel,
    ]
  );

  return {
    handleGenerationSourceChange,
    handleTextModelChange,
  };
}

export function useGenerationSource(props: UseGenerationSourceProps): UseGenerationSourceReturn {
  const {
    projectImageSettings,
    isLoadingProjectSettings,
    updateProjectImageSettings,
    markAsInteracted,
    loraManager,
    setHiresFixConfig,
  } = props;

  const [generationSource, setGenerationSource] =
    useState<GenerationSource>('by-reference');
  const [selectedTextModel, setSelectedTextModel] =
    useState<TextToImageModel>('qwen-image');

  const generationSourceRef = useSyncedRef(generationSource);
  const selectedTextModelRef = useSyncedRef(selectedTextModel);

  useGenerationSourceInitialization({
    projectImageSettings,
    isLoadingProjectSettings,
    generationSource,
    selectedTextModel,
    setGenerationSource,
    setSelectedTextModel,
    loraManager,
  });

  const { handleGenerationSourceChange, handleTextModelChange } =
    useGenerationSourceHandlers({
      updateProjectImageSettings,
      markAsInteracted,
      setHiresFixConfig,
      projectImageSettings,
      loraManager,
      generationSource,
      selectedTextModel,
      setGenerationSource,
      setSelectedTextModel,
    });

  return {
    generationSource,
    selectedTextModel,
    generationSourceRef,
    selectedTextModelRef,
    handleGenerationSourceChange,
    handleTextModelChange,
  };
}
