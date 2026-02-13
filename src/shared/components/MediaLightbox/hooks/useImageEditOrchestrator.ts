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

import { useMemo, useCallback } from 'react';
import type { GenerationRow } from '@/types/shots';
import type { ImageEditState } from '../contexts/ImageEditContext';
import type { EditAdvancedSettings, QwenEditModel } from './editSettingsTypes';
import type { UseLoraManagerReturn } from '@/shared/hooks/useLoraManager';
import type { LoraModel } from '@/shared/components/LoraSelectorModal';

import {
  useInpainting,
  useEditSettingsSync,
  useMagicEditMode,
  useRepositionMode,
  useImg2ImgMode,
} from './index';

// ============================================================================
// Props
// ============================================================================

export interface UseImageEditOrchestratorProps {
  // Media & project
  media: GenerationRow;
  selectedProjectId: string | null;
  actualGenerationId: string | null;
  shotId?: string;
  toolTypeOverride?: string;
  autoEnterInpaint: boolean;

  // Image display
  imageDimensions: { width: number; height: number } | null;
  imageContainerRef: React.RefObject<HTMLDivElement | null>;
  effectiveImageUrl: string;

  // Variant state (from useSharedLightboxState)
  activeVariant: {
    id?: string;
    location?: string;
    thumbnail_url?: string;
    params?: Record<string, unknown> | null;
  } | null;
  setActiveVariantId: (id: string) => void;
  refetchVariants: () => void;

  // Edit settings persistence (from useEditSettingsPersistence)
  editSettingsPersistence: {
    loraMode: string;
    setLoraMode: (mode: string) => void;
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
    editModeLoRAs: Array<{ url: string; strength: number }> | undefined;
    createAsGeneration: boolean;
    setCreateAsGeneration: (value: boolean) => void;
    advancedSettings: EditAdvancedSettings;
    setAdvancedSettings: (updates: Partial<EditAdvancedSettings>) => void;
    qwenEditModel: QwenEditModel;
    setQwenEditModel: (model: QwenEditModel) => void;
    editMode: string;
    setEditMode: (mode: string) => void;
    isReady: boolean;
    hasPersistedSettings: boolean;
  };

  // LoRA managers
  effectiveEditModeLoRAs: Array<{ url: string; strength: number }> | undefined;
  editLoraManager: UseLoraManagerReturn;
  availableLoras?: LoraModel[];

  // Thumbnail URL for magic edit
  thumbnailUrl?: string;
}

// ============================================================================
// Return Type
// ============================================================================

export interface UseImageEditOrchestratorReturn {
  // Context value (pass to ImageEditProvider)
  imageEditValue: ImageEditState;

  // Mode state (for layout, panel, and shell decisions)
  isInpaintMode: boolean;
  isMagicEditMode: boolean;
  isSpecialEditMode: boolean;
  editMode: string;

  // Mode entry/exit (for panel mode restore and shared state)
  handleEnterMagicEditMode: () => void;
  handleExitMagicEditMode: () => void;

  // Generation handlers (passed to EditModePanel)
  handleUnifiedGenerate: () => Promise<void>;
  handleGenerateAnnotatedEdit: () => void;
  handleGenerateReposition: () => void;
  handleSaveAsVariant: () => void;
  handleGenerateImg2Img: () => Promise<void>;

  // Img2Img LoRA manager (passed to EditModePanel)
  img2imgLoraManager: UseLoraManagerReturn;

}

// ============================================================================
// Hook
// ============================================================================

export function useImageEditOrchestrator({
  media,
  selectedProjectId,
  actualGenerationId,
  shotId,
  toolTypeOverride,
  autoEnterInpaint,
  imageDimensions,
  imageContainerRef,
  effectiveImageUrl,
  activeVariant,
  setActiveVariantId,
  refetchVariants,
  editSettingsPersistence,
  effectiveEditModeLoRAs,
  editLoraManager,
  availableLoras,
  thumbnailUrl,
}: UseImageEditOrchestratorProps): UseImageEditOrchestratorReturn {

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
    isReady: isEditSettingsReady,
    hasPersistedSettings,
  } = editSettingsPersistence;

  // ========================================
  // INPAINTING HOOK
  // ========================================

  const inpaintingHook = useInpainting({
    media,
    selectedProjectId,
    shotId,
    toolTypeOverride,
    isVideo: false,
    imageContainerRef,
    imageDimensions,
    handleExitInpaintMode: () => {},
    loras: effectiveEditModeLoRAs,
    activeVariantId: activeVariant?.id,
    activeVariantLocation: activeVariant?.location,
    createAsGeneration,
    advancedSettings,
    qwenEditModel,
    imageUrl: activeVariant?.location || effectiveImageUrl,
    thumbnailUrl: thumbnailUrl || media.thumbUrl,
    initialEditMode: persistedEditMode,
  });

  const {
    isInpaintMode,
    brushStrokes,
    isEraseMode,
    inpaintPrompt,
    inpaintNumGenerations,
    brushSize,
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isAnnotateMode,
    editMode,
    annotationMode,
    selectedShapeId,
    setIsInpaintMode,
    setIsEraseMode,
    setInpaintPrompt,
    setInpaintNumGenerations,
    setBrushSize,
    setIsAnnotateMode,
    setEditMode,
    setAnnotationMode,
    handleUndo,
    handleClearMask,
    handleEnterInpaintMode,
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
    handleDeleteSelected,
    handleToggleFreeForm,
    getDeleteButtonPosition,
    onStrokeComplete,
    onStrokesChange,
    onSelectionChange,
    onTextModeHint,
    strokeOverlayRef,
  } = inpaintingHook;

  // ========================================
  // EDIT SETTINGS SYNC
  // ========================================

  useEditSettingsSync({
    actualGenerationId,
    isEditSettingsReady,
    hasPersistedSettings,
    persistedEditMode,
    persistedNumGenerations,
    persistedPrompt,
    editMode,
    inpaintNumGenerations,
    inpaintPrompt,
    setEditMode,
    setInpaintNumGenerations,
    setInpaintPrompt,
    setPersistedEditMode,
    setPersistedNumGenerations,
    setPersistedPrompt,
  });

  const handleExitInpaintMode = useCallback(() => {
    setIsInpaintMode(false);
  }, [setIsInpaintMode]);

  // ========================================
  // MAGIC EDIT MODE HOOK
  // ========================================

  const magicEditHook = useMagicEditMode({
    media,
    selectedProjectId,
    autoEnterInpaint,
    isVideo: false,
    isInpaintMode,
    setIsInpaintMode,
    handleEnterInpaintMode,
    handleGenerateInpaint,
    brushStrokes,
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,
    editModeLoRAs: effectiveEditModeLoRAs,
    sourceUrlForTasks: effectiveImageUrl,
    imageDimensions,
    toolTypeOverride,
    isInSceneBoostEnabled: false,
    setIsInSceneBoostEnabled: () => {},
    activeVariantId: activeVariant?.id,
    activeVariantLocation: activeVariant?.location,
    createAsGeneration,
    advancedSettings,
    qwenEditModel,
    enabled: true,
  });

  const {
    isMagicEditMode,
    setIsMagicEditMode,
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
    inpaintPanelPosition,
    setInpaintPanelPosition,
    handleEnterMagicEditMode,
    handleExitMagicEditMode,
    handleUnifiedGenerate,
    isSpecialEditMode,
  } = magicEditHook;

  // ========================================
  // REPOSITION MODE HOOK
  // ========================================

  const repositionHook = useRepositionMode({
    media,
    selectedProjectId,
    imageDimensions,
    imageContainerRef,
    loras: effectiveEditModeLoRAs,
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

  const {
    transform: repositionTransform,
    hasTransformChanges,
    isGeneratingReposition,
    repositionGenerateSuccess,
    isSavingAsVariant,
    saveAsVariantSuccess,
    setScale,
    setRotation,
    toggleFlipH,
    toggleFlipV,
    resetTransform,
    handleGenerateReposition,
    handleSaveAsVariant,
    getTransformStyle,
    isDragging: isRepositionDragging,
    dragHandlers: repositionDragHandlers,
  } = repositionHook;

  // ========================================
  // IMG2IMG MODE HOOK
  // ========================================

  const img2imgHook = useImg2ImgMode({
    media,
    selectedProjectId,
    isVideo: false,
    sourceUrlForTasks: effectiveImageUrl,
    toolTypeOverride,
    createAsGeneration,
    availableLoras,
    img2imgStrength: persistedImg2imgStrength,
    setImg2imgStrength: setPersistedImg2imgStrength,
    enablePromptExpansion: persistedImg2imgEnablePromptExpansion,
    setEnablePromptExpansion: setPersistedImg2imgEnablePromptExpansion,
    img2imgPrompt: persistedImg2imgPrompt,
    setImg2imgPrompt: setPersistedImg2imgPrompt,
    img2imgPromptHasBeenSet: persistedImg2imgPromptHasBeenSet,
    numGenerations: persistedNumGenerations,
    activeVariantLocation: activeVariant?.location,
    activeVariantId: activeVariant?.id,
    shotId,
  });

  const {
    img2imgPrompt,
    img2imgStrength,
    enablePromptExpansion,
    isGeneratingImg2Img,
    img2imgGenerateSuccess,
    setImg2imgPrompt,
    setImg2imgStrength,
    setEnablePromptExpansion,
    handleGenerateImg2Img,
    loraManager: img2imgLoraManager,
  } = img2imgHook;

  // ========================================
  // BUILD ImageEditContext VALUE
  // ========================================

  // Placeholder values for context fields not yet wired to real state
  const isFlippedHorizontally = false;
  const isSaving = false;

  const imageEditValue = useMemo<ImageEditState>(() => ({
    // Mode state
    isInpaintMode,
    isMagicEditMode,
    isSpecialEditMode,
    editMode: editMode as ImageEditState['editMode'],

    // Mode setters
    setIsInpaintMode,
    setIsMagicEditMode,
    setEditMode: setEditMode as ImageEditState['setEditMode'],

    // Mode entry/exit handlers
    handleEnterInpaintMode,
    handleExitInpaintMode,
    handleEnterMagicEditMode,
    handleExitMagicEditMode,

    // Brush/Inpaint state
    brushSize,
    setBrushSize,
    isEraseMode,
    setIsEraseMode,
    brushStrokes,

    // Annotation state
    isAnnotateMode,
    setIsAnnotateMode,
    annotationMode,
    setAnnotationMode,
    selectedShapeId,

    // Undo/Clear
    handleUndo,
    handleClearMask,

    // Canvas interaction
    onStrokeComplete,
    onStrokesChange,
    onSelectionChange,
    onTextModeHint,
    strokeOverlayRef,
    getDeleteButtonPosition,
    handleToggleFreeForm,
    handleDeleteSelected,

    // Reposition state + interaction handlers
    repositionTransform,
    hasTransformChanges,
    isRepositionDragging,
    repositionDragHandlers,
    getTransformStyle,
    setScale,
    setRotation,
    toggleFlipH,
    toggleFlipV,
    resetTransform,

    // Display refs
    imageContainerRef,
    isFlippedHorizontally,
    isSaving,

    // Panel UI state
    inpaintPanelPosition,
    setInpaintPanelPosition,

    // Inpaint form
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,

    // Img2Img form
    img2imgPrompt,
    setImg2imgPrompt,
    img2imgStrength,
    setImg2imgStrength,
    enablePromptExpansion,
    setEnablePromptExpansion,

    // LoRA mode
    loraMode,
    setLoraMode,
    customLoraUrl,
    setCustomLoraUrl,

    // Generation options
    createAsGeneration,
    setCreateAsGeneration,

    // Model selection
    qwenEditModel,
    setQwenEditModel,

    // Advanced settings
    advancedSettings,
    setAdvancedSettings,

    // Generation status
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isGeneratingImg2Img,
    img2imgGenerateSuccess,
    isGeneratingReposition,
    repositionGenerateSuccess,
    isSavingAsVariant,
    saveAsVariantSuccess,
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
  }), [
    isInpaintMode, isMagicEditMode, isSpecialEditMode, editMode,
    setIsInpaintMode, setIsMagicEditMode, setEditMode,
    handleEnterInpaintMode, handleExitInpaintMode, handleEnterMagicEditMode, handleExitMagicEditMode,
    brushSize, setBrushSize, isEraseMode, setIsEraseMode, brushStrokes,
    isAnnotateMode, setIsAnnotateMode, annotationMode, setAnnotationMode, selectedShapeId,
    handleUndo, handleClearMask,
    onStrokeComplete, onStrokesChange, onSelectionChange, onTextModeHint, strokeOverlayRef,
    getDeleteButtonPosition, handleToggleFreeForm, handleDeleteSelected,
    repositionTransform, hasTransformChanges, isRepositionDragging, repositionDragHandlers,
    getTransformStyle, setScale, setRotation, toggleFlipH, toggleFlipV, resetTransform,
    imageContainerRef, isFlippedHorizontally, isSaving,
    inpaintPanelPosition, setInpaintPanelPosition,
    inpaintPrompt, setInpaintPrompt, inpaintNumGenerations, setInpaintNumGenerations,
    img2imgPrompt, setImg2imgPrompt, img2imgStrength, setImg2imgStrength,
    enablePromptExpansion, setEnablePromptExpansion,
    loraMode, setLoraMode, customLoraUrl, setCustomLoraUrl,
    createAsGeneration, setCreateAsGeneration, qwenEditModel, setQwenEditModel,
    advancedSettings, setAdvancedSettings,
    isGeneratingInpaint, inpaintGenerateSuccess, isGeneratingImg2Img, img2imgGenerateSuccess,
    isGeneratingReposition, repositionGenerateSuccess, isSavingAsVariant, saveAsVariantSuccess,
    isCreatingMagicEditTasks, magicEditTasksCreated,
  ]);

  return {
    imageEditValue,
    isInpaintMode,
    isMagicEditMode,
    isSpecialEditMode,
    editMode,
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
