/**
 * ImageEditContext — Composed provider for all image edit state.
 *
 * Splits state into three sub-contexts by concern:
 *   - ImageEditCanvasContext: mode, brush, annotation, canvas, reposition, display
 *   - ImageEditFormContext: prompts, strengths, LoRA, model, advanced settings
 *   - ImageEditStatusContext: generation loading/success flags
 *
 * The split reduces re-renders: canvas components don't re-render when the user
 * types in a prompt field, and form components don't re-render on brush strokes.
 *
 * ImageEditState still exists as a composed type. Components should use the
 * specific sub-context hooks (useImageEditCanvasSafe, useImageEditFormSafe,
 * useImageEditStatusSafe) for optimal performance.
 */

import React, { useMemo } from 'react';

// Sub-contexts
import {
  ImageEditCanvasProvider,
  useImageEditCanvasSafe,
  type ImageEditCanvasState,
} from './ImageEditCanvasContext';
import {
  ImageEditFormProvider,
  useImageEditFormSafe,
  type ImageEditFormState,
} from './ImageEditFormContext';
import {
  ImageEditStatusProvider,
  useImageEditStatusSafe,
  type ImageEditStatusState,
} from './ImageEditStatusContext';

// Re-export sub-context types and hooks for direct consumption
export type { ImageEditCanvasState, ImageEditFormState, ImageEditStatusState };
export { useImageEditCanvasSafe, useImageEditFormSafe, useImageEditStatusSafe };

// ============================================================================
// Composed Type (backward-compatible)
// ============================================================================

/**
 * Full image edit state, composed from the three sub-contexts.
 * Consumers that need fields from only one concern should use the
 * sub-context hooks directly for better performance.
 */
export type ImageEditState =
  ImageEditCanvasState &
  ImageEditFormState &
  ImageEditStatusState;

// ============================================================================
// Composed Provider
// ============================================================================

interface ImageEditProviderProps {
  children: React.ReactNode;
  value: ImageEditState;
}

/**
 * Provides all three sub-contexts from a single ImageEditState value.
 * The value is split into sub-context slices via useMemo.
 */
export const ImageEditProvider: React.FC<ImageEditProviderProps> = ({
  children,
  value,
}) => {
  // Split the composed value into sub-context slices.
  // Each useMemo depends only on the fields for that sub-context,
  // so unchanged slices keep the same reference.

  const canvasValue = useMemo<ImageEditCanvasState>(() => ({
    // Edit mode
    isInpaintMode: value.isInpaintMode,
    isMagicEditMode: value.isMagicEditMode,
    isSpecialEditMode: value.isSpecialEditMode,
    editMode: value.editMode,
    setIsInpaintMode: value.setIsInpaintMode,
    setIsMagicEditMode: value.setIsMagicEditMode,
    setEditMode: value.setEditMode,
    handleEnterInpaintMode: value.handleEnterInpaintMode,
    handleExitInpaintMode: value.handleExitInpaintMode,
    handleEnterMagicEditMode: value.handleEnterMagicEditMode,
    handleExitMagicEditMode: value.handleExitMagicEditMode,
    // Brush tool
    brushSize: value.brushSize,
    setBrushSize: value.setBrushSize,
    isEraseMode: value.isEraseMode,
    setIsEraseMode: value.setIsEraseMode,
    brushStrokes: value.brushStrokes,
    handleUndo: value.handleUndo,
    handleClearMask: value.handleClearMask,
    toolPanelPosition: value.toolPanelPosition,
    setToolPanelPosition: value.setToolPanelPosition,
    // Annotation tool
    isAnnotateMode: value.isAnnotateMode,
    setIsAnnotateMode: value.setIsAnnotateMode,
    annotationMode: value.annotationMode,
    setAnnotationMode: value.setAnnotationMode,
    selectedShapeId: value.selectedShapeId,
    // Canvas interaction
    onStrokeComplete: value.onStrokeComplete,
    onStrokesChange: value.onStrokesChange,
    onSelectionChange: value.onSelectionChange,
    onTextModeHint: value.onTextModeHint,
    strokeOverlayRef: value.strokeOverlayRef,
    getDeleteButtonPosition: value.getDeleteButtonPosition,
    handleToggleFreeForm: value.handleToggleFreeForm,
    handleDeleteSelected: value.handleDeleteSelected,
    // Reposition
    repositionTransform: value.repositionTransform,
    hasTransformChanges: value.hasTransformChanges,
    isRepositionDragging: value.isRepositionDragging,
    repositionDragHandlers: value.repositionDragHandlers,
    getTransformStyle: value.getTransformStyle,
    setScale: value.setScale,
    setRotation: value.setRotation,
    toggleFlipH: value.toggleFlipH,
    toggleFlipV: value.toggleFlipV,
    resetTransform: value.resetTransform,
    // Display refs
    imageContainerRef: value.imageContainerRef,
    isFlippedHorizontally: value.isFlippedHorizontally,
    isSaving: value.isSaving,
  }), [
    value.isInpaintMode, value.isMagicEditMode, value.isSpecialEditMode, value.editMode,
    value.setIsInpaintMode, value.setIsMagicEditMode, value.setEditMode,
    value.handleEnterInpaintMode, value.handleExitInpaintMode,
    value.handleEnterMagicEditMode, value.handleExitMagicEditMode,
    value.brushSize, value.setBrushSize, value.isEraseMode, value.setIsEraseMode,
    value.brushStrokes, value.handleUndo, value.handleClearMask,
    value.toolPanelPosition, value.setToolPanelPosition,
    value.isAnnotateMode, value.setIsAnnotateMode, value.annotationMode,
    value.setAnnotationMode, value.selectedShapeId,
    value.onStrokeComplete, value.onStrokesChange, value.onSelectionChange,
    value.onTextModeHint, value.strokeOverlayRef,
    value.getDeleteButtonPosition, value.handleToggleFreeForm, value.handleDeleteSelected,
    value.repositionTransform, value.hasTransformChanges,
    value.isRepositionDragging, value.repositionDragHandlers,
    value.getTransformStyle, value.setScale, value.setRotation,
    value.toggleFlipH, value.toggleFlipV, value.resetTransform,
    value.imageContainerRef, value.isFlippedHorizontally, value.isSaving,
  ]);

  const formValue = useMemo<ImageEditFormState>(() => ({
    inpaintPrompt: value.inpaintPrompt,
    setInpaintPrompt: value.setInpaintPrompt,
    inpaintNumGenerations: value.inpaintNumGenerations,
    setInpaintNumGenerations: value.setInpaintNumGenerations,
    img2imgPrompt: value.img2imgPrompt,
    setImg2imgPrompt: value.setImg2imgPrompt,
    img2imgStrength: value.img2imgStrength,
    setImg2imgStrength: value.setImg2imgStrength,
    enablePromptExpansion: value.enablePromptExpansion,
    setEnablePromptExpansion: value.setEnablePromptExpansion,
    loraMode: value.loraMode,
    setLoraMode: value.setLoraMode,
    customLoraUrl: value.customLoraUrl,
    setCustomLoraUrl: value.setCustomLoraUrl,
    createAsGeneration: value.createAsGeneration,
    setCreateAsGeneration: value.setCreateAsGeneration,
    qwenEditModel: value.qwenEditModel,
    setQwenEditModel: value.setQwenEditModel,
    advancedSettings: value.advancedSettings,
    setAdvancedSettings: value.setAdvancedSettings,
  }), [
    value.inpaintPrompt, value.setInpaintPrompt,
    value.inpaintNumGenerations, value.setInpaintNumGenerations,
    value.img2imgPrompt, value.setImg2imgPrompt,
    value.img2imgStrength, value.setImg2imgStrength,
    value.enablePromptExpansion, value.setEnablePromptExpansion,
    value.loraMode, value.setLoraMode,
    value.customLoraUrl, value.setCustomLoraUrl,
    value.createAsGeneration, value.setCreateAsGeneration,
    value.qwenEditModel, value.setQwenEditModel,
    value.advancedSettings, value.setAdvancedSettings,
  ]);

  const statusValue = useMemo<ImageEditStatusState>(() => ({
    isGeneratingInpaint: value.isGeneratingInpaint,
    inpaintGenerateSuccess: value.inpaintGenerateSuccess,
    isGeneratingImg2Img: value.isGeneratingImg2Img,
    img2imgGenerateSuccess: value.img2imgGenerateSuccess,
    isGeneratingReposition: value.isGeneratingReposition,
    repositionGenerateSuccess: value.repositionGenerateSuccess,
    isSavingAsVariant: value.isSavingAsVariant,
    saveAsVariantSuccess: value.saveAsVariantSuccess,
    isCreatingMagicEditTasks: value.isCreatingMagicEditTasks,
    magicEditTasksCreated: value.magicEditTasksCreated,
  }), [
    value.isGeneratingInpaint, value.inpaintGenerateSuccess,
    value.isGeneratingImg2Img, value.img2imgGenerateSuccess,
    value.isGeneratingReposition, value.repositionGenerateSuccess,
    value.isSavingAsVariant, value.saveAsVariantSuccess,
    value.isCreatingMagicEditTasks, value.magicEditTasksCreated,
  ]);

  return (
    <ImageEditCanvasProvider value={canvasValue}>
      <ImageEditFormProvider value={formValue}>
        <ImageEditStatusProvider value={statusValue}>
          {children}
        </ImageEditStatusProvider>
      </ImageEditFormProvider>
    </ImageEditCanvasProvider>
  );
};
