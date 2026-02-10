/**
 * useLoraHandlers - Wraps loraManager with persistence to project settings
 *
 * Handles:
 * - Adding/removing/updating LORAs
 * - Persisting LORA selections to per-category project storage
 * - Marking form as interacted for save tracking
 */

import { useCallback } from 'react';
import { LoraModel } from '@/shared/components/LoraSelectorModal';
import { ActiveLora } from '@/shared/components/ActiveLoRAsDisplay';
import { handleError } from '@/shared/lib/errorHandler';
import {
  GenerationSource,
  TextToImageModel,
  LoraCategory,
  getLoraCategoryForModel,
  ProjectImageSettings,
} from '../types';

// ============================================================================
// Types
// ============================================================================

interface UseLoraHandlersProps {
  // LORA manager from useLoraManager
  loraManager: {
    selectedLoras: ActiveLora[];
    handleAddLora: (lora: LoraModel) => void;
    handleRemoveLora: (id: string) => void;
    handleLoraStrengthChange: (id: string, strength: number) => void;
    handleLoadProjectLoras?: () => Promise<void>;
  };

  // Form interaction tracking
  markAsInteracted: () => void;

  // Model/source for category determination
  generationSource: GenerationSource;
  selectedTextModel: TextToImageModel;

  // Project settings for persistence
  projectImageSettings: ProjectImageSettings | null;
  updateProjectImageSettings: ((scope: string, updates: Partial<ProjectImageSettings>) => Promise<void>) | null;
}

interface UseLoraHandlersReturn {
  handleAddLora: (lora: LoraModel) => void;
  handleRemoveLora: (id: string) => void;
  handleLoraStrengthChange: (id: string, strength: number) => void;
  handleLoadProjectLoras: () => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useLoraHandlers(props: UseLoraHandlersProps): UseLoraHandlersReturn {
  const {
    loraManager,
    markAsInteracted,
    generationSource,
    selectedTextModel,
    projectImageSettings,
    updateProjectImageSettings,
  } = props;

  // ============================================================================
  // Persistence Helper
  // ============================================================================

  // Persist LORAs to per-category storage
  // Categories: 'qwen' (all Qwen models + by-reference) and 'z-image'
  const persistLorasToCategory = useCallback(async (loras: ActiveLora[]) => {
    if (!updateProjectImageSettings) return;

    // Determine current category based on generation source and model
    const category: LoraCategory = generationSource === 'by-reference'
      ? 'qwen'
      : getLoraCategoryForModel(selectedTextModel);

    const currentLorasByCategory = projectImageSettings?.selectedLorasByCategory ?? {
      'qwen': [],
      'z-image': [],
    };
    const updatedLorasByCategory = {
      ...currentLorasByCategory,
      [category]: loras,
    };

    try {
      await updateProjectImageSettings('project', { selectedLorasByCategory: updatedLorasByCategory });
    } catch (error) {
      handleError(error, { context: 'useLoraHandlers.persistLorasToCategory', showToast: false });
    }
  }, [updateProjectImageSettings, projectImageSettings?.selectedLorasByCategory, selectedTextModel, generationSource]);

  // ============================================================================
  // Handlers
  // ============================================================================

  const handleAddLora = useCallback((loraToAdd: LoraModel) => {
    markAsInteracted();
    loraManager.handleAddLora(loraToAdd);

    // Build the new LORA object for persistence
    const newLora: ActiveLora = {
      id: loraToAdd["Model ID"],
      name: loraToAdd.Name !== "N/A" ? loraToAdd.Name : loraToAdd["Model ID"],
      path: loraToAdd.high_noise_url || loraToAdd["Model Files"]?.[0]?.url || loraToAdd["Model Files"]?.[0]?.path || '',
      strength: 1.0,
      previewImageUrl: loraToAdd.Images?.[0]?.url,
      trigger_word: loraToAdd.trigger_word,
      lowNoisePath: loraToAdd.low_noise_url,
      isMultiStage: !!(loraToAdd.high_noise_url || loraToAdd.low_noise_url),
    };

    // Persist to per-category storage
    persistLorasToCategory([...loraManager.selectedLoras, newLora]);
  }, [markAsInteracted, loraManager, persistLorasToCategory]);

  const handleRemoveLora = useCallback((loraIdToRemove: string) => {
    markAsInteracted();
    loraManager.handleRemoveLora(loraIdToRemove);

    // Persist to per-category storage after removing
    persistLorasToCategory(loraManager.selectedLoras.filter(l => l.id !== loraIdToRemove));
  }, [markAsInteracted, loraManager, persistLorasToCategory]);

  const handleLoraStrengthChange = useCallback((loraId: string, newStrength: number) => {
    markAsInteracted();
    loraManager.handleLoraStrengthChange(loraId, newStrength);

    // Persist to per-category storage after updating strength
    persistLorasToCategory(loraManager.selectedLoras.map(l =>
      l.id === loraId ? { ...l, strength: newStrength } : l
    ));
  }, [markAsInteracted, loraManager, persistLorasToCategory]);

  const handleLoadProjectLoras = useCallback(async () => {
    await loraManager.handleLoadProjectLoras?.();
    markAsInteracted();
  }, [loraManager, markAsInteracted]);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    handleAddLora,
    handleRemoveLora,
    handleLoraStrengthChange,
    handleLoadProjectLoras,
  };
}
