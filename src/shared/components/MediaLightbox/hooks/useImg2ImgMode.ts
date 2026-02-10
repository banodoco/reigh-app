import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/sonner';
import { handleError } from '@/shared/lib/errorHandler';
import { queryKeys } from '@/shared/lib/queryKeys';
import { GenerationRow } from '@/types/shots';
import { createBatchZImageTurboI2ITasks, ZImageLoraConfig } from '@/shared/lib/tasks/zImageTurboI2I';
import { useLoraManager, UseLoraManagerReturn, ActiveLora, LoraModel } from '@/shared/hooks/useLoraManager';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';

interface UseImg2ImgModeProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  isVideo: boolean;
  sourceUrlForTasks: string;
  toolTypeOverride?: string;
  createAsGeneration?: boolean;
  availableLoras?: LoraModel[];
  // Persisted values from editSettingsPersistence
  img2imgStrength: number;
  setImg2imgStrength: (strength: number) => void;
  enablePromptExpansion: boolean;
  setEnablePromptExpansion: (enabled: boolean) => void;
  // Prompt is persisted per-generation (shared with other edit modes)
  img2imgPrompt: string;
  setImg2imgPrompt: (prompt: string) => void;
  img2imgPromptHasBeenSet: boolean;
  // Number of generations (shared with other edit modes)
  numGenerations: number;
  // Active variant's image URL - use this instead of sourceUrlForTasks when editing a variant
  activeVariantLocation?: string | null;
  // Active variant ID - for tracking source_variant_id in task params
  activeVariantId?: string | null;
  // Shot ID for associating task with shot (enables navigation from TasksPane)
  shotId?: string;
}

interface UseImg2ImgModeReturn {
  // State
  img2imgPrompt: string;
  img2imgStrength: number;
  enablePromptExpansion: boolean;
  isGeneratingImg2Img: boolean;
  img2imgGenerateSuccess: boolean;

  // Setters
  setImg2imgPrompt: (prompt: string) => void;
  setImg2imgStrength: (strength: number) => void;
  setEnablePromptExpansion: (enabled: boolean) => void;

  // LoRA Manager (full access)
  loraManager: UseLoraManagerReturn;

  // Actions
  handleGenerateImg2Img: () => Promise<void>;
}

/**
 * Hook for managing Img2Img mode state and generation
 * Uses Z Image Turbo I2I task type with full LoRA selector support
 * 
 * Strength, enablePromptExpansion, and prompt are persisted via editSettingsPersistence
 * Prompt is persisted per-generation (shared with other edit modes, never inherited)
 */
export const useImg2ImgMode = ({
  media,
  selectedProjectId,
  isVideo,
  sourceUrlForTasks,
  toolTypeOverride,
  createAsGeneration,
  availableLoras = [],
  // Persisted values
  img2imgStrength,
  setImg2imgStrength,
  enablePromptExpansion,
  setEnablePromptExpansion,
  // Prompt is persisted per-generation
  img2imgPrompt,
  setImg2imgPrompt,
  img2imgPromptHasBeenSet,
  // Number of generations (shared)
  numGenerations,
  // Active variant location
  activeVariantLocation,
  // Active variant ID for tracking source
  activeVariantId,
  // Shot association
  shotId,
}: UseImg2ImgModeProps): UseImg2ImgModeReturn => {
  // Local state (not persisted)
  const [isGeneratingImg2Img, setIsGeneratingImg2Img] = useState(false);
  const [img2imgGenerateSuccess, setImg2imgGenerateSuccess] = useState(false);
  const { addIncomingTask, removeIncomingTask } = useIncomingTasks();
  const queryClient = useQueryClient();

  // Derive the base generation prompt from the generation params (best-effort)
  const baseGenerationPrompt = useMemo(() => {
    const params = media.params;
    const raw =
      (typeof params?.base_prompt === 'string' && params.base_prompt) ||
      (typeof params?.prompt === 'string' && params.prompt) ||
      '';
    return raw.trim();
  }, [media]);

  // Default Img2Img prompt to the prompt that generated the base image (one-time per generation)
  useEffect(() => {
    if (img2imgPromptHasBeenSet) return;
    if (img2imgPrompt && img2imgPrompt.trim().length > 0) return;
    if (!baseGenerationPrompt) return;

    setImg2imgPrompt(baseGenerationPrompt);
  }, [img2imgPromptHasBeenSet, img2imgPrompt, baseGenerationPrompt, setImg2imgPrompt]);

  // Use the shared LoRA manager hook
  const loraManager = useLoraManager(availableLoras, {
    projectId: selectedProjectId || undefined,
    persistenceScope: 'none', // Don't persist for img2img - it's a quick tool
    enableProjectPersistence: false,
    disableAutoLoad: true,
  });

  // Track generation to prevent double-submits
  const isSubmittingRef = useRef(false);

  const handleGenerateImg2Img = useCallback(async () => {
    // Validate inputs
    if (!selectedProjectId) {
      toast.error('No project selected');
      return;
    }

    if (isVideo) {
      toast.error('Img2Img is only available for images');
      return;
    }

    if (!sourceUrlForTasks && !activeVariantLocation) {
      toast.error('No source image URL available');
      return;
    }

    // Prevent double-submits
    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    const incomingTaskId = addIncomingTask({
      taskType: 'z_image_turbo_i2i',
      label: img2imgPrompt.trim() || 'Img2Img...',
    });
    setIsGeneratingImg2Img(true);

    try {
      // Convert selected LoRAs to the format expected by the task
      const loras: ZImageLoraConfig[] = loraManager.selectedLoras.map((lora: ActiveLora) => ({
        path: lora.path,
        scale: lora.strength,
      }));

      // Use active variant's location if editing a variant, otherwise use sourceUrlForTasks
      const effectiveImageUrl = activeVariantLocation || sourceUrlForTasks;

      // Get actual generation ID (handle shot_generations case)
      const actualGenerationId = getGenerationId(media);

      // Create tasks based on numGenerations
      await createBatchZImageTurboI2ITasks({
        project_id: selectedProjectId,
        image_url: effectiveImageUrl,
        prompt: img2imgPrompt.trim() || undefined,
        strength: img2imgStrength,
        enable_prompt_expansion: enablePromptExpansion,
        numImages: numGenerations,
        loras: loras.length > 0 ? loras : undefined,
        based_on: actualGenerationId,
        source_variant_id: activeVariantId || undefined, // Track source variant if editing from a variant
        create_as_generation: createAsGeneration,
        tool_type: toolTypeOverride,
        shot_id: shotId,
      });

      // Show success state
      setImg2imgGenerateSuccess(true);

      // Reset success state after 2 seconds
      setTimeout(() => {
        setImg2imgGenerateSuccess(false);
      }, 2000);

    } catch (error) {
      handleError(error, { context: 'useImg2ImgMode', toastTitle: 'Failed to create Img2Img tasks' });
    } finally {
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
      removeIncomingTask(incomingTaskId);
      setIsGeneratingImg2Img(false);
      isSubmittingRef.current = false;
    }
  }, [
    selectedProjectId,
    isVideo,
    sourceUrlForTasks,
    activeVariantLocation,
    activeVariantId,
    media,
    img2imgPrompt,
    img2imgStrength,
    enablePromptExpansion,
    numGenerations,
    loraManager.selectedLoras,
    createAsGeneration,
    toolTypeOverride,
    shotId,
    addIncomingTask,
    removeIncomingTask,
    queryClient,
  ]);

  return {
    // State
    img2imgPrompt,
    img2imgStrength,
    enablePromptExpansion,
    isGeneratingImg2Img,
    img2imgGenerateSuccess,

    // Setters
    setImg2imgPrompt,
    setImg2imgStrength,
    setEnablePromptExpansion,

    // LoRA Manager
    loraManager,

    // Actions
    handleGenerateImg2Img,
  };
};
