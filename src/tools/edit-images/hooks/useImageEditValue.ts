import { useMemo } from 'react';
import type { ImageEditState } from '@/shared/components/MediaLightbox/contexts/ImageEditContext';
import { DEFAULT_ADVANCED_SETTINGS } from '@/shared/components/MediaLightbox/hooks/editSettingsTypes';
import type { BrushStroke, AnnotationMode } from '@/shared/components/MediaLightbox/hooks/inpainting/types';
import type { StrokeOverlayHandle } from '@/shared/components/MediaLightbox/components/StrokeOverlay';
import type { ImageTransform } from '@/shared/components/MediaLightbox/hooks/useRepositionMode';
import type { LoraMode } from '@/shared/components/MediaLightbox/hooks/editSettingsTypes';

// ============================================================================
// Params — sub-hook results needed to build ImageEditState
// ============================================================================

interface UseImageEditValueParams {
  // Mode state
  isInpaintMode: boolean;
  isSpecialEditMode: boolean;
  editMode: string | null;

  // Mode setters
  setIsInpaintMode: (value: boolean) => void;
  setEditMode: (mode: ImageEditState['editMode']) => void;

  // Mode entry/exit handlers
  handleEnterInpaintMode: () => void;
  handleExitMagicEditMode: () => void;
  handleEnterMagicEditMode: () => void;

  // Brush/Inpaint state
  brushSize: number;
  setBrushSize: (size: number) => void;
  isEraseMode: boolean;
  setIsEraseMode: (value: boolean) => void;
  brushStrokes: BrushStroke[];

  // Annotation state
  isAnnotateMode: boolean;
  setIsAnnotateMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  annotationMode: AnnotationMode;
  setAnnotationMode: (mode: AnnotationMode | ((prev: AnnotationMode) => AnnotationMode)) => void;
  selectedShapeId: string | null;

  // Canvas interaction
  onStrokeComplete: (stroke: BrushStroke) => void;
  onStrokesChange: (strokes: BrushStroke[]) => void;
  onSelectionChange: (shapeId: string | null) => void;
  onTextModeHint: () => void;
  strokeOverlayRef: React.RefObject<StrokeOverlayHandle>;
  getDeleteButtonPosition: () => { x: number; y: number } | null;
  handleToggleFreeForm: () => void;
  handleDeleteSelected: () => void;

  // Undo/Clear
  handleUndo: () => void;
  handleClearMask: () => void;

  // Reposition state
  repositionTransform: ImageTransform | null;
  hasTransformChanges: boolean;
  isRepositionDragging: boolean;
  repositionDragHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onWheel: (e: React.WheelEvent) => void;
  } | null;
  getTransformStyle: () => string;
  setScale: (value: number) => void;
  setRotation: (value: number) => void;
  toggleFlipH: () => void;
  toggleFlipV: () => void;
  resetTransform: () => void;

  // Display refs
  imageContainerRef: React.RefObject<HTMLDivElement>;

  // Panel UI state
  inpaintPanelPosition: 'left' | 'right';
  setInpaintPanelPosition: (pos: 'left' | 'right') => void;

  // Inpaint form
  inpaintPrompt: string;
  setInpaintPrompt: (value: string) => void;
  inpaintNumGenerations: number;
  setInpaintNumGenerations: (value: number) => void;

  // Img2Img form
  img2imgPrompt: string;
  setImg2imgPrompt: (value: string) => void;
  img2imgStrength: number;
  setImg2imgStrength: (value: number) => void;
  enablePromptExpansion: boolean;
  setEnablePromptExpansion: (value: boolean) => void;

  // LoRA mode
  loraMode: LoraMode;
  setLoraMode: (mode: LoraMode) => void;
  customLoraUrl: string;
  setCustomLoraUrl: (url: string) => void;

  // Generation options
  createAsGeneration: boolean;
  setCreateAsGeneration: (value: boolean) => void;

  // Generation status
  isGeneratingInpaint: boolean;
  inpaintGenerateSuccess: boolean;
  isGeneratingImg2Img: boolean;
  img2imgGenerateSuccess: boolean;
  isGeneratingReposition: boolean;
  repositionGenerateSuccess: boolean;
  isSavingAsVariant: boolean;
  saveAsVariantSuccess: boolean;
  isCreatingMagicEditTasks: boolean;
  magicEditTasksCreated: boolean;
}

// ============================================================================
// Hook — builds the memoized ImageEditState from sub-hook results
// ============================================================================

export function useImageEditValue(params: UseImageEditValueParams): ImageEditState {
  const {
    isInpaintMode,
    isSpecialEditMode,
    editMode,
    setIsInpaintMode,
    setEditMode,
    handleEnterInpaintMode,
    handleExitMagicEditMode,
    handleEnterMagicEditMode,
    brushSize,
    setBrushSize,
    isEraseMode,
    setIsEraseMode,
    brushStrokes,
    isAnnotateMode,
    setIsAnnotateMode,
    annotationMode,
    setAnnotationMode,
    selectedShapeId,
    onStrokeComplete,
    onStrokesChange,
    onSelectionChange,
    onTextModeHint,
    strokeOverlayRef,
    getDeleteButtonPosition,
    handleToggleFreeForm,
    handleDeleteSelected,
    handleUndo,
    handleClearMask,
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
    imageContainerRef,
    inpaintPanelPosition,
    setInpaintPanelPosition,
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,
    img2imgPrompt,
    setImg2imgPrompt,
    img2imgStrength,
    setImg2imgStrength,
    enablePromptExpansion,
    setEnablePromptExpansion,
    loraMode,
    setLoraMode,
    customLoraUrl,
    setCustomLoraUrl,
    createAsGeneration,
    setCreateAsGeneration,
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
  } = params;

  return useMemo<ImageEditState>(() => ({
    // Mode state
    isInpaintMode,
    isMagicEditMode: isSpecialEditMode,
    isSpecialEditMode,
    editMode: editMode as ImageEditState['editMode'],

    // Mode setters
    setIsInpaintMode,
    setIsMagicEditMode: () => {},
    setEditMode: setEditMode as ImageEditState['setEditMode'],

    // Mode entry/exit handlers
    handleEnterInpaintMode,
    handleExitInpaintMode: handleExitMagicEditMode,
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

    // Canvas interaction
    onStrokeComplete,
    onStrokesChange,
    onSelectionChange,
    onTextModeHint,
    strokeOverlayRef,
    getDeleteButtonPosition,
    handleToggleFreeForm,
    handleDeleteSelected,

    // Undo/Clear
    handleUndo,
    handleClearMask,

    // Reposition state
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
    isFlippedHorizontally: false,
    isSaving: false,

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
    qwenEditModel: 'qwen-edit-2511',
    setQwenEditModel: () => {},

    // Advanced settings (not used in InlineEditView)
    advancedSettings: DEFAULT_ADVANCED_SETTINGS,
    setAdvancedSettings: () => {},

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
    isInpaintMode,
    isSpecialEditMode,
    editMode,
    setIsInpaintMode,
    setEditMode,
    handleEnterInpaintMode,
    handleExitMagicEditMode,
    handleEnterMagicEditMode,
    brushSize,
    setBrushSize,
    isEraseMode,
    setIsEraseMode,
    brushStrokes,
    isAnnotateMode,
    setIsAnnotateMode,
    annotationMode,
    setAnnotationMode,
    selectedShapeId,
    onStrokeComplete,
    onStrokesChange,
    onSelectionChange,
    onTextModeHint,
    strokeOverlayRef,
    getDeleteButtonPosition,
    handleToggleFreeForm,
    handleDeleteSelected,
    handleUndo,
    handleClearMask,
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
    imageContainerRef,
    inpaintPanelPosition,
    setInpaintPanelPosition,
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,
    img2imgPrompt,
    setImg2imgPrompt,
    img2imgStrength,
    setImg2imgStrength,
    enablePromptExpansion,
    setEnablePromptExpansion,
    loraMode,
    setLoraMode,
    customLoraUrl,
    setCustomLoraUrl,
    createAsGeneration,
    setCreateAsGeneration,
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
  ]);
}
