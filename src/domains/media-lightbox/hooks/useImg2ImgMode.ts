import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { GenerationRow } from '@/domains/generation/types';
import { createBatchZImageTurboImageToImageTasks } from '@/shared/lib/tasks/zImageTurboI2I';
import type { FalLoraConfig } from '@/domains/lora/types/lora';
import { useLoraManager, UseLoraManagerReturn, ActiveLora, LoraModel } from '@/domains/lora/hooks/useLoraManager';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { useTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';

interface Img2ImgPersistedState {
  strength: number;
  setStrength: (strength: number) => void;
  enablePromptExpansion: boolean;
  setEnablePromptExpansion: (enabled: boolean) => void;
  prompt: string;
  setPrompt: (prompt: string) => void;
  promptHasBeenSet: boolean;
  numGenerations: number;
}

interface Img2ImgSourceContext {
  baseImageUrl: string;
  activeVariantLocation?: string | null;
  activeVariantId?: string | null;
  shotId?: string;
}

interface Img2ImgTaskOptions {
  toolTypeOverride?: string;
  createAsGeneration?: boolean;
}

interface UseImg2ImgModeProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  isVideo: boolean;
  availableLoras?: LoraModel[];
  state: Img2ImgPersistedState;
  source: Img2ImgSourceContext;
  options?: Img2ImgTaskOptions;
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
  availableLoras = [],
  state,
  source,
  options,
}: UseImg2ImgModeProps): UseImg2ImgModeReturn => {
  const {
    strength: img2imgStrength,
    setStrength: setImg2imgStrength,
    enablePromptExpansion,
    setEnablePromptExpansion,
    prompt: img2imgPrompt,
    setPrompt: setImg2imgPrompt,
    promptHasBeenSet: img2imgPromptHasBeenSet,
    numGenerations,
  } = state;
  const { baseImageUrl, activeVariantLocation, activeVariantId, shotId } = source;
  const { toolTypeOverride, createAsGeneration } = options ?? {};

  // Local state (not persisted)
  const [isGeneratingImg2Img, setIsGeneratingImg2Img] = useState(false);
  const [img2imgGenerateSuccess, setImg2imgGenerateSuccess] = useState(false);
  const run = useTaskPlaceholder();

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

    if (!baseImageUrl && !activeVariantLocation) {
      toast.error('No source image URL available');
      return;
    }

    // Prevent double-submits
    if (isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true;
    setIsGeneratingImg2Img(true);

    try {
      await run({
        taskType: 'z_image_turbo_i2i',
        label: img2imgPrompt.trim() || 'Img2Img...',
        context: 'useImg2ImgMode',
        toastTitle: 'Failed to create Img2Img tasks',
        create: () => {
          // Convert selected LoRAs to the format expected by the task
          const loras: FalLoraConfig[] = loraManager.selectedLoras.map((lora: ActiveLora) => ({
            path: lora.path,
            scale: lora.strength,
          }));

          // Use active variant's location if editing a variant, otherwise use the base image URL
          const effectiveImageUrl = activeVariantLocation || baseImageUrl;

          // Get actual generation ID (handle shot_generations case)
          const actualGenerationId = getGenerationId(media);

          return createBatchZImageTurboImageToImageTasks({
            project_id: selectedProjectId,
            image_url: effectiveImageUrl,
            prompt: img2imgPrompt.trim() || undefined,
            strength: img2imgStrength,
            enable_prompt_expansion: enablePromptExpansion,
            numImages: numGenerations,
            loras: loras.length > 0 ? loras : undefined,
            based_on: actualGenerationId ?? undefined,
            source_variant_id: activeVariantId || undefined,
            create_as_generation: createAsGeneration,
            tool_type: toolTypeOverride,
            shot_id: shotId,
          });
        },
        onSuccess: () => {
          setImg2imgGenerateSuccess(true);
          setTimeout(() => {
            setImg2imgGenerateSuccess(false);
          }, 2000);
        },
      });
    } finally {
      setIsGeneratingImg2Img(false);
      isSubmittingRef.current = false;
    }
  }, [
    selectedProjectId,
    isVideo,
    baseImageUrl,
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
    run,
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
