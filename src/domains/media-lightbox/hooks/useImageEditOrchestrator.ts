/**
 * useImageEditOrchestrator
 *
 * Composes all image-edit mode hooks (inpainting, magic edit, reposition, img2img)
 * and builds the ImageEditContext value. Extracted from ImageLightbox to keep it
 * under 400 lines.
 *
 * Inputs: media, variant state, edit-settings persistence, lora management, upscale state.
 * Outputs: imageEditValue (for context), mode flags, and generation handlers.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import type { LoraModel } from '@/domains/lora/types/lora';
import type { LoraManagerState } from '@/domains/lora/types/loraManager';
import type { ImageEditState } from '../contexts/ImageEditContext';
import type { EditAdvancedSettings, EditMode, LoraMode, QwenEditModel } from '../model/editSettingsTypes';
import type { AnnotationMode } from './inpainting/types';

import { useMagicEditMode } from './useMagicEditMode';
import { useRepositionMode } from './useRepositionMode';
import { useImg2ImgMode } from './useImg2ImgMode';
import { useInpainting } from './useInpainting';
import { buildImageEditStateValue } from '../model/buildImageEditStateValue';

// ============================================================================
// Props
// ============================================================================

interface UseImageEditOrchestratorProps {
  // Media & project context
  mediaContext: {
    media: GenerationRow;
    selectedProjectId: string | null;
    actualGenerationId: string | null;
    shotId?: string;
    toolTypeOverride?: string;
    initialActive: boolean;
    thumbnailUrl?: string;
  };

  // Image display context
  displayContext: {
    imageDimensions: { width: number; height: number } | null;
    imageContainerRef: React.RefObject<HTMLDivElement | null>;
    effectiveImageUrl: string;
  };

  // Variant state context (from useSharedLightboxState)
  variantContext: {
  activeVariant: {
    id?: string | null;
    location?: string | null;
    thumbnail_url?: string | null;
    params?: Record<string, unknown> | null;
  } | null;
  setActiveVariantId: (id: string) => void;
  refetchVariants: () => void;
  };

  // Edit settings persistence context (from useEditSettingsPersistence)
  settingsContext: {
    loraMode: LoraMode;
    setLoraMode: (mode: LoraMode) => void;
    customLoraUrl: string;
    setCustomLoraUrl: (url: string) => void;
    prompt: string;
    setPrompt: (prompt: string) => void;
    numGenerations: number;
    setNumGenerations: (num: number) => void;
    img2imgStrength: number;
    setImg2imgStrength: (strength: number) => void;
    img2imgEnablePromptExpansion: boolean;
    setImg2imgEnablePromptExpansion: (enabled: boolean) => void;
    img2imgPrompt: string;
    setImg2imgPrompt: (prompt: string) => void;
    img2imgPromptHasBeenSet: boolean;
    editModeLoras: Array<{ url: string; strength: number }> | undefined;
    createAsGeneration: boolean;
    setCreateAsGeneration: (value: boolean) => void;
    advancedSettings: EditAdvancedSettings;
    setAdvancedSettings: (updates: Partial<EditAdvancedSettings>) => void;
    qwenEditModel: QwenEditModel;
    setQwenEditModel: (model: QwenEditModel) => void;
    editMode: EditMode;
    setEditMode: (mode: EditMode) => void;
    isReady: boolean;
    hasPersistedSettings: boolean;
  };

  // LoRA context
  loraContext: {
    effectiveEditModeLoras: Array<{ url: string; strength: number }> | undefined;
    availableLoras?: LoraModel[];
  };
}

// ============================================================================
// Return Type
// ============================================================================

interface UseImageEditOrchestratorReturn {
  // Context value (pass to ImageEditProvider)
  imageEditValue: ImageEditState;

  // Mode state (for layout, panel, and shell decisions)
  isInpaintMode: boolean;
  isMagicEditMode: boolean;
  isSpecialEditMode: boolean;
  editMode: EditMode;

  // Mode entry/exit (for panel mode restore and shared state)
  handleEnterMagicEditMode: () => void;
  handleExitMagicEditMode: () => void;

  // Generation handlers (passed to EditModePanel)
  handleUnifiedGenerate: () => Promise<void>;
  handleGenerateAnnotatedEdit: () => Promise<void>;
  handleGenerateReposition: () => Promise<void>;
  handleSaveAsVariant: () => Promise<void>;
  handleGenerateImg2Img: () => Promise<void>;

  // Img2Img LoRA manager (passed to EditModePanel)
  img2imgLoraManager: LoraManagerState;

}

export function useImageEditOrchestrator({
  mediaContext,
  displayContext,
  variantContext,
  settingsContext,
  loraContext,
}: UseImageEditOrchestratorProps): UseImageEditOrchestratorReturn {
  const {
    media,
    selectedProjectId,
    shotId,
    toolTypeOverride,
    initialActive,
    thumbnailUrl,
  } = mediaContext;
  const {
    imageDimensions,
    imageContainerRef,
    effectiveImageUrl,
  } = displayContext;
  const {
    activeVariant,
    setActiveVariantId,
    refetchVariants,
  } = variantContext;
  const {
    effectiveEditModeLoras,
    availableLoras,
  } = loraContext;

  const {
    loraMode, setLoraMode,
    customLoraUrl, setCustomLoraUrl,
    prompt: persistedPrompt, setPrompt: setPersistedPrompt,
    numGenerations: persistedNumGenerations, setNumGenerations: setPersistedNumGenerations,
    img2imgStrength: persistedImg2imgStrength, setImg2imgStrength: setPersistedImg2imgStrength,
    img2imgEnablePromptExpansion: persistedImg2imgEnablePromptExpansion,
    setImg2imgEnablePromptExpansion: setPersistedImg2imgEnablePromptExpansion,
    img2imgPrompt: persistedImg2imgPrompt, setImg2imgPrompt: setPersistedImg2imgPrompt,
    img2imgPromptHasBeenSet: persistedImg2imgPromptHasBeenSet,
    createAsGeneration, setCreateAsGeneration,
    advancedSettings, setAdvancedSettings,
    qwenEditModel, setQwenEditModel,
    editMode: persistedEditMode, setEditMode: setPersistedEditMode,
  } = settingsContext;
  const [annotationMode, setAnnotationMode] = useState<AnnotationMode>(null);

  useEffect(() => {
    setAnnotationMode(null);
  }, [media.id]);

  const inpaintingHook = useInpainting({
    media,
    selectedProjectId,
    shotId,
    toolTypeOverride,
    isVideo: false,
    imageContainerRef,
    imageDimensions,
    handleExitInpaintMode: () => {},
    loras: effectiveEditModeLoras,
    activeVariantId: activeVariant?.id,
    activeVariantLocation: activeVariant?.location,
    createAsGeneration,
    advancedSettings,
    qwenEditModel,
    imageUrl: activeVariant?.location || effectiveImageUrl,
    thumbnailUrl: thumbnailUrl || media.thumbUrl,
    editMode: persistedEditMode,
    annotationMode,
    inpaintPrompt: persistedPrompt,
    inpaintNumGenerations: persistedNumGenerations,
    setEditMode: setPersistedEditMode,
    setAnnotationMode,
    setInpaintPrompt: setPersistedPrompt,
    setInpaintNumGenerations: setPersistedNumGenerations,
  });

  const {
    isInpaintMode,
    setIsInpaintMode,
    brushStrokes,
    inpaintPrompt,
    inpaintNumGenerations,
    setInpaintPrompt,
    setInpaintNumGenerations,
    handleEnterInpaintMode,
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
  } = inpaintingHook;

  const handleExitInpaintMode = useCallback(() => {
    setIsInpaintMode(false);
  }, [setIsInpaintMode]);

  // ========================================
  // MAGIC EDIT MODE HOOK
  // ========================================

  const magicEditHook = useMagicEditMode({
    media,
    selectedProjectId,
    isInpaintMode,
    setIsInpaintMode,
    handleEnterInpaintMode,
    handleGenerateInpaint,
    brushStrokes,
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,
    editModeLoras: effectiveEditModeLoras,
    loraMode,
    setLoraMode,
    sourceUrlForTasks: effectiveImageUrl,
    imageDimensions,
    toolTypeOverride,
    activeVariantId: activeVariant?.id,
    activeVariantLocation: activeVariant?.location,
    createAsGeneration,
    advancedSettings,
    qwenEditModel,
    enabled: true,
    initialActive,
  });

  const {
    isMagicEditMode, isSpecialEditMode,
    handleEnterMagicEditMode, handleExitMagicEditMode, handleUnifiedGenerate,
  } = magicEditHook;

  // ========================================
  // REPOSITION MODE HOOK
  // ========================================

  const repositionHook = useRepositionMode({
    media,
    selectedProjectId,
    imageDimensions,
    imageContainerRef,
    loras: effectiveEditModeLoras,
    inpaintPrompt,
    inpaintNumGenerations,
    toolTypeOverride,
    shotId,
    onVariantCreated: setActiveVariantId,
    refetchVariants,
    createAsGeneration,
    advancedSettings,
    activeVariantLocation: activeVariant?.location,
    activeVariantId: activeVariant?.id,
    activeVariantParams: activeVariant?.params as Record<string, unknown> | null,
    qwenEditModel,
  });

  const { handleGenerateReposition, handleSaveAsVariant } = repositionHook;

  // ========================================
  // IMG2IMG MODE HOOK
  // ========================================

  const img2imgHook = useImg2ImgMode({
    media,
    selectedProjectId,
    isVideo: false,
    availableLoras,
    state: {
      strength: persistedImg2imgStrength,
      setStrength: setPersistedImg2imgStrength,
      enablePromptExpansion: persistedImg2imgEnablePromptExpansion,
      setEnablePromptExpansion: setPersistedImg2imgEnablePromptExpansion,
      prompt: persistedImg2imgPrompt,
      setPrompt: setPersistedImg2imgPrompt,
      promptHasBeenSet: persistedImg2imgPromptHasBeenSet,
      numGenerations: persistedNumGenerations,
    },
    source: {
      baseImageUrl: effectiveImageUrl,
      activeVariantLocation: activeVariant?.location,
      activeVariantId: activeVariant?.id,
      shotId,
    },
    options: {
      toolTypeOverride,
      createAsGeneration,
    },
  });

  const { handleGenerateImg2Img, loraManager: img2imgLoraManager } = img2imgHook;

  // ========================================
  // BUILD ImageEditContext VALUE
  // ========================================

  const imageEditValue = useMemo<ImageEditState>(
    () => buildImageEditStateValue({
      inpainting: inpaintingHook,
      magic: magicEditHook,
      reposition: repositionHook,
      img2img: img2imgHook,
      imageContainerRef,
      handleExitInpaintMode,
      editMode: persistedEditMode,
      setEditMode: setPersistedEditMode,
      loraMode, setLoraMode,
      customLoraUrl, setCustomLoraUrl,
      createAsGeneration, setCreateAsGeneration,
      qwenEditModel, setQwenEditModel,
      advancedSettings, setAdvancedSettings,
    }),
    [
      inpaintingHook, magicEditHook, repositionHook, img2imgHook,
      imageContainerRef, handleExitInpaintMode, persistedEditMode, setPersistedEditMode,
      loraMode, setLoraMode, customLoraUrl, setCustomLoraUrl,
      createAsGeneration, setCreateAsGeneration, qwenEditModel, setQwenEditModel,
      advancedSettings, setAdvancedSettings,
    ],
  );

  return {
    imageEditValue,
    isInpaintMode,
    isMagicEditMode,
    isSpecialEditMode,
    editMode: persistedEditMode,
    handleEnterMagicEditMode,
    handleExitMagicEditMode,
    handleUnifiedGenerate,
    handleGenerateAnnotatedEdit,
    handleGenerateReposition,
    handleSaveAsVariant,
    handleGenerateImg2Img,
    img2imgLoraManager,
  };
}
