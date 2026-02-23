import { useMemo } from 'react';
import type { ImageEditState, ImageEditMode } from '@/shared/components/MediaLightbox/contexts/ImageEditContext';
import type { BrushStroke, AnnotationMode } from '@/shared/components/MediaLightbox/hooks/inpainting/types';
import type { StrokeOverlayHandle } from '@/shared/components/MediaLightbox/components/StrokeOverlay';
import type { ImageTransform } from '@/shared/components/MediaLightbox/hooks/useRepositionMode';
import type { LoraMode } from '@/shared/components/MediaLightbox/hooks/editSettingsTypes';
import type { EditAdvancedSettings, QwenEditModel } from '@/shared/components/MediaLightbox/hooks/editSettingsTypes';
import type { CSSProperties } from 'react';

// ============================================================================
// Params — sub-hook results needed to build ImageEditState
// ============================================================================

interface UseImageEditValueParams {
  // Mode state
  isInpaintMode: boolean;
  isSpecialEditMode: boolean;
  editMode: ImageEditMode;

  // Mode setters
  setIsInpaintMode: (value: boolean) => void;
  setIsMagicEditMode: (value: boolean) => void;
  setEditMode: (mode: ImageEditState['editMode']) => void;

  // Mode entry/exit handlers
  handleEnterInpaintMode: () => void;
  handleExitInpaintMode: () => void;
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
  qwenEditModel: QwenEditModel;
  setQwenEditModel: (model: QwenEditModel) => void;
  advancedSettings: EditAdvancedSettings;
  setAdvancedSettings: (settings: EditAdvancedSettings) => void;

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

function buildModeState(params: UseImageEditValueParams): Partial<ImageEditState> {
  return {
    isInpaintMode: params.isInpaintMode,
    isMagicEditMode: params.isSpecialEditMode,
    isSpecialEditMode: params.isSpecialEditMode,
    editMode: params.editMode,
    setIsInpaintMode: params.setIsInpaintMode,
    setIsMagicEditMode: params.setIsMagicEditMode,
    setEditMode: params.setEditMode,
    handleEnterInpaintMode: params.handleEnterInpaintMode,
    handleExitInpaintMode: params.handleExitInpaintMode,
    handleEnterMagicEditMode: params.handleEnterMagicEditMode,
    handleExitMagicEditMode: params.handleExitMagicEditMode,
  };
}

function buildCanvasAndAnnotationState(params: UseImageEditValueParams): Partial<ImageEditState> {
  return {
    brushSize: params.brushSize,
    setBrushSize: params.setBrushSize,
    isEraseMode: params.isEraseMode,
    setIsEraseMode: params.setIsEraseMode,
    brushStrokes: params.brushStrokes,
    isAnnotateMode: params.isAnnotateMode,
    setIsAnnotateMode: params.setIsAnnotateMode,
    annotationMode: params.annotationMode,
    setAnnotationMode: params.setAnnotationMode,
    selectedShapeId: params.selectedShapeId,
    onStrokeComplete: params.onStrokeComplete,
    onStrokesChange: params.onStrokesChange,
    onSelectionChange: params.onSelectionChange,
    onTextModeHint: params.onTextModeHint,
    strokeOverlayRef: params.strokeOverlayRef,
    getDeleteButtonPosition: params.getDeleteButtonPosition,
    handleToggleFreeForm: params.handleToggleFreeForm,
    handleDeleteSelected: params.handleDeleteSelected,
    handleUndo: params.handleUndo,
    handleClearMask: params.handleClearMask,
  };
}

function buildRepositionAndPanelState(params: UseImageEditValueParams): Partial<ImageEditState> {
  return {
    repositionTransform: params.repositionTransform,
    hasTransformChanges: params.hasTransformChanges,
    isRepositionDragging: params.isRepositionDragging,
    repositionDragHandlers: params.repositionDragHandlers,
    getTransformStyle: (): CSSProperties => ({ transform: params.getTransformStyle() }),
    setScale: params.setScale,
    setRotation: params.setRotation,
    toggleFlipH: params.toggleFlipH,
    toggleFlipV: params.toggleFlipV,
    resetTransform: params.resetTransform,
    imageContainerRef: params.imageContainerRef,
    isFlippedHorizontally: false,
    isSaving: false,
    inpaintPanelPosition: params.inpaintPanelPosition,
    setInpaintPanelPosition: params.setInpaintPanelPosition,
  };
}

function buildFormAndGenerationState(params: UseImageEditValueParams): Partial<ImageEditState> {
  return {
    inpaintPrompt: params.inpaintPrompt,
    setInpaintPrompt: params.setInpaintPrompt,
    inpaintNumGenerations: params.inpaintNumGenerations,
    setInpaintNumGenerations: params.setInpaintNumGenerations,
    img2imgPrompt: params.img2imgPrompt,
    setImg2imgPrompt: params.setImg2imgPrompt,
    img2imgStrength: params.img2imgStrength,
    setImg2imgStrength: params.setImg2imgStrength,
    enablePromptExpansion: params.enablePromptExpansion,
    setEnablePromptExpansion: params.setEnablePromptExpansion,
    loraMode: params.loraMode,
    setLoraMode: params.setLoraMode,
    customLoraUrl: params.customLoraUrl,
    setCustomLoraUrl: params.setCustomLoraUrl,
    createAsGeneration: params.createAsGeneration,
    setCreateAsGeneration: params.setCreateAsGeneration,
    qwenEditModel: params.qwenEditModel,
    setQwenEditModel: params.setQwenEditModel,
    advancedSettings: params.advancedSettings,
    setAdvancedSettings: params.setAdvancedSettings,
    isGeneratingInpaint: params.isGeneratingInpaint,
    inpaintGenerateSuccess: params.inpaintGenerateSuccess,
    isGeneratingImg2Img: params.isGeneratingImg2Img,
    img2imgGenerateSuccess: params.img2imgGenerateSuccess,
    isGeneratingReposition: params.isGeneratingReposition,
    repositionGenerateSuccess: params.repositionGenerateSuccess,
    isSavingAsVariant: params.isSavingAsVariant,
    saveAsVariantSuccess: params.saveAsVariantSuccess,
    isCreatingMagicEditTasks: params.isCreatingMagicEditTasks,
    magicEditTasksCreated: params.magicEditTasksCreated,
  };
}

function buildImageEditState(params: UseImageEditValueParams): ImageEditState {
  const imageEditState = {
    ...buildModeState(params),
    ...buildCanvasAndAnnotationState(params),
    ...buildRepositionAndPanelState(params),
    ...buildFormAndGenerationState(params),
  } satisfies ImageEditState;

  return imageEditState;
}

export function useImageEditValue(params: UseImageEditValueParams): ImageEditState {
  return useMemo<ImageEditState>(
    () => buildImageEditState(params),
    [params]
  );
}
