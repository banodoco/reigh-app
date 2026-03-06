/**
 * ImageEditCanvasContext
 *
 * Canvas/tool state for image editing in the lightbox.
 * Contains mode, brush, annotation, canvas interaction, reposition,
 * display refs, and panel position state.
 *
 * Consumers: LightboxLayout, FloatingToolControls, MediaDisplayWithCanvas, InfoPanel.
 * Split from ImageEditContext to avoid re-renders from form/status changes.
 */

import React, { createContext, useContext } from 'react';
import type { BrushStroke, AnnotationMode } from '../hooks/inpainting/types';
import type { ImageTransform } from '../hooks/useRepositionMode';
import type { StrokeOverlayHandle } from '../components/StrokeOverlay';

// ============================================================================
// Types
// ============================================================================

export type ImageEditMode = 'inpaint' | 'annotate' | 'reposition' | 'img2img' | 'text' | 'upscale' | null;

interface ImageEditModeState {
  isInpaintMode: boolean;
  isMagicEditMode: boolean;
  isSpecialEditMode: boolean;
  editMode: ImageEditMode;
  setIsInpaintMode: (value: boolean) => void;
  setIsMagicEditMode: (value: boolean) => void;
  setEditMode: (mode: ImageEditMode) => void;
  handleEnterInpaintMode: () => void;
  handleExitInpaintMode: () => void;
  handleEnterMagicEditMode: () => void;
  handleExitMagicEditMode: () => void;
}

interface ImageEditBrushState {
  brushSize: number;
  setBrushSize: (size: number) => void;
  isEraseMode: boolean;
  setIsEraseMode: (value: boolean) => void;
  brushStrokes: BrushStroke[];
  handleUndo: () => void;
  handleClearMask: () => void;
  inpaintPanelPosition: 'left' | 'right';
  setInpaintPanelPosition: (pos: 'left' | 'right') => void;
}

interface ImageEditAnnotationState {
  isAnnotateMode: boolean;
  setIsAnnotateMode: (value: boolean | ((prev: boolean) => boolean)) => void;
  annotationMode: AnnotationMode;
  setAnnotationMode: (mode: AnnotationMode | ((prev: AnnotationMode) => AnnotationMode)) => void;
  selectedShapeId: string | null;
}

interface ImageEditCanvasInteractionState {
  onStrokeComplete: (stroke: BrushStroke) => void;
  onStrokesChange: (strokes: BrushStroke[]) => void;
  onSelectionChange: (shapeId: string | null) => void;
  onTextModeHint: () => void;
  strokeOverlayRef: React.RefObject<StrokeOverlayHandle>;
  getDeleteButtonPosition: () => { x: number; y: number } | null;
  handleToggleFreeForm: () => void;
  handleDeleteSelected: () => void;
}

interface ImageEditRepositionState {
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
  getTransformStyle: () => React.CSSProperties;
  setScale: (value: number) => void;
  setRotation: (value: number) => void;
  toggleFlipH: () => void;
  toggleFlipV: () => void;
  resetTransform: () => void;
}

interface ImageEditDisplayState {
  imageContainerRef: React.RefObject<HTMLDivElement | null>;
  isFlippedHorizontally: boolean;
  isSaving: boolean;
}

export type ImageEditCanvasState = ImageEditModeState &
  ImageEditBrushState &
  ImageEditAnnotationState &
  ImageEditCanvasInteractionState &
  ImageEditRepositionState &
  ImageEditDisplayState;

// ============================================================================
// Defaults
// ============================================================================

const EMPTY_CANVAS: ImageEditCanvasState = {
  // Edit mode
  isInpaintMode: false,
  isMagicEditMode: false,
  isSpecialEditMode: false,
  editMode: null,
  setIsInpaintMode: () => {},
  setIsMagicEditMode: () => {},
  setEditMode: () => {},
  handleEnterInpaintMode: () => {},
  handleExitInpaintMode: () => {},
  handleEnterMagicEditMode: () => {},
  handleExitMagicEditMode: () => {},

  // Brush tool
  brushSize: 20,
  setBrushSize: () => {},
  isEraseMode: false,
  setIsEraseMode: () => {},
  brushStrokes: [],
  handleUndo: () => {},
  handleClearMask: () => {},
  inpaintPanelPosition: 'right',
  setInpaintPanelPosition: () => {},

  // Annotation tool
  isAnnotateMode: false,
  setIsAnnotateMode: () => {},
  annotationMode: null,
  setAnnotationMode: () => {},
  selectedShapeId: null,

  // Canvas interaction
  onStrokeComplete: () => {},
  onStrokesChange: () => {},
  onSelectionChange: () => {},
  onTextModeHint: () => {},
  strokeOverlayRef: { current: null } as React.RefObject<StrokeOverlayHandle>,
  getDeleteButtonPosition: () => null,
  handleToggleFreeForm: () => {},
  handleDeleteSelected: () => {},

  // Reposition
  repositionTransform: null,
  hasTransformChanges: false,
  isRepositionDragging: false,
  repositionDragHandlers: null,
  getTransformStyle: () => ({}),
  setScale: () => {},
  setRotation: () => {},
  toggleFlipH: () => {},
  toggleFlipV: () => {},
  resetTransform: () => {},

  // Display refs
  imageContainerRef: { current: null } as React.RefObject<HTMLDivElement | null>,
  isFlippedHorizontally: false,
  isSaving: false,
};

// ============================================================================
// Context + Hook
// ============================================================================

const ImageEditCanvasContext = createContext<ImageEditCanvasState | null>(null);

interface ImageEditCanvasProviderProps {
  children: React.ReactNode;
  value: ImageEditCanvasState;
}

export const ImageEditCanvasProvider: React.FC<ImageEditCanvasProviderProps> = ({
  children,
  value,
}) => {
  return (
    <ImageEditCanvasContext.Provider value={value}>
      {children}
    </ImageEditCanvasContext.Provider>
  );
};

/**
 * Returns canvas/tool edit state, or safe defaults when used outside provider.
 */
export function useImageEditCanvasSafe(): ImageEditCanvasState {
  const context = useContext(ImageEditCanvasContext);
  return context ?? EMPTY_CANVAS;
}
