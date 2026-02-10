/**
 * useInpainting - Main hook for inpainting functionality
 *
 * This is the orchestrator that composes several sub-hooks:
 * - useMediaPersistence: Handles localStorage, in-memory cache, and DB persistence
 * - usePointerHandlers: Handles all pointer events for drawing and dragging
 * - useStrokeRendering: Handles canvas rendering of strokes
 * - useInpaintActions: Handles user actions (undo, clear, delete, etc.)
 * - useTaskGeneration: Handles task creation for inpaint/annotate edits
 *
 * The sub-hooks are located in ./inpainting/
 */

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import type { StrokeOverlayHandle } from '../components/StrokeOverlay';

// Import types
import type {
  BrushStroke,
  EditMode,
  AnnotationMode,
  UseInpaintingProps,
  UseInpaintingReturn,
  EditAdvancedSettings,
  QwenEditModel,
  ImageDimensions,
  CanvasSize,
} from './inpainting/types';

// Import sub-hooks
import { useMediaPersistence } from './inpainting/useMediaPersistence';
import { usePointerHandlers } from './inpainting/usePointerHandlers';
import { useStrokeRendering } from './inpainting/useStrokeRendering';
import { useInpaintActions } from './inpainting/useInpaintActions';
import { useTaskGeneration } from './inpainting/useTaskGeneration';

// Import helpers
import { getRectangleCorners } from './inpainting/shapeHelpers';

// Re-export types for consumers
export type { BrushStroke, EditMode, AnnotationMode, UseInpaintingProps, UseInpaintingReturn };

/**
 * Hook for managing inpainting functionality
 * Handles canvas drawing, mask creation, and inpaint task generation
 */
export const useInpainting = ({
  media,
  selectedProjectId,
  shotId,
  toolTypeOverride,
  isVideo,
  imageDimensions,
  displayCanvasRef,
  maskCanvasRef,
  imageContainerRef,
  handleExitInpaintMode,
  loras,
  activeVariantId,
  activeVariantLocation,
  createAsGeneration,
  advancedSettings,
  qwenEditModel,
  imageUrl,
  thumbnailUrl,
  initialEditMode,
}: UseInpaintingProps): UseInpaintingReturn => {
  // ============================================
  // Core state
  // ============================================
  const [isInpaintMode, setIsInpaintMode] = useState(false);
  const [isGeneratingInpaint, setIsGeneratingInpaint] = useState(false);
  const [inpaintGenerateSuccess, setInpaintGenerateSuccess] = useState(false);
  const [showTextModeHint, setShowTextModeHint] = useState(false);
  const [isImageLoaded, setIsImageLoaded] = useState(false);
  const [imageLoadError, setImageLoadError] = useState<string | null>(null);

  // Ref for StrokeOverlay to enable mask export
  const strokeOverlayRef = useRef<StrokeOverlayHandle>(null);

  // ============================================
  // Media Persistence (strokes, editMode, etc.)
  // ============================================
  const {
    editMode,
    annotationMode,
    inpaintStrokes,
    annotationStrokes,
    inpaintPrompt,
    inpaintNumGenerations,
    brushSize,
    setEditMode,
    setAnnotationMode,
    setInpaintStrokes,
    setAnnotationStrokes,
    setInpaintPrompt,
    setInpaintNumGenerations,
    setBrushSize,
  } = useMediaPersistence({
    media,
    activeVariantId,
    isInpaintMode,
    initialEditMode,
  });

  // Computed values
  const isAnnotateMode = editMode === 'annotate';
  const [isEraseMode, setIsEraseMode] = useState(false);

  // Computed: current brush strokes based on mode
  const brushStrokes = useMemo(() => {
    return editMode === 'annotate' ? annotationStrokes : editMode === 'inpaint' ? inpaintStrokes : [];
  }, [editMode, annotationStrokes, inpaintStrokes]);

  // Computed: setter for current mode's strokes
  const setBrushStrokes = useMemo(() => {
    return editMode === 'annotate' ? setAnnotationStrokes : setInpaintStrokes;
  }, [editMode, setAnnotationStrokes, setInpaintStrokes]);

  // ============================================
  // Pointer Handlers (before rendering so we have selectedShapeId)
  // ============================================
  const {
    isDrawing,
    currentStroke,
    selectedShapeId,
    setSelectedShapeId,
    handleKonvaPointerDown,
    handleKonvaPointerMove,
    handleKonvaPointerUp,
    handleShapeClick,
  } = usePointerHandlers({
    isInpaintMode,
    editMode,
    annotationMode,
    isAnnotateMode,
    brushStrokes,
    annotationStrokes,
    isEraseMode,
    brushSize,
    setBrushStrokes,
    setAnnotationStrokes,
    setShowTextModeHint,
  });

  // ============================================
  // Stroke Rendering (after pointer handlers so we have selectedShapeId)
  // ============================================
  const {
    redrawStrokes,
    canvasSize,
    imageToCanvas,
  } = useStrokeRendering({
    isInpaintMode,
    editMode,
    inpaintStrokes,
    annotationStrokes,
    selectedShapeId,
    imageDimensions,
    displayCanvasRef,
    maskCanvasRef,
  });

  // ============================================
  // User Actions
  // ============================================
  const {
    handleUndo,
    handleClearMask,
    handleDeleteSelected,
    handleToggleFreeForm,
  } = useInpaintActions({
    isInpaintMode,
    isAnnotateMode,
    brushStrokes,
    selectedShapeId,
    setInpaintStrokes,
    setAnnotationStrokes,
    setSelectedShapeId,
    redrawStrokes,
  });

  // ============================================
  // Task Generation
  // ============================================
  const {
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
  } = useTaskGeneration({
    media,
    selectedProjectId,
    shotId,
    toolTypeOverride,
    isVideo,
    loras,
    activeVariantId,
    activeVariantLocation,
    createAsGeneration,
    advancedSettings,
    qwenEditModel,
    inpaintStrokes,
    annotationStrokes,
    inpaintPrompt,
    inpaintNumGenerations,
    strokeOverlayRef,
    handleExitInpaintMode,
    setIsGeneratingInpaint,
    setInpaintGenerateSuccess,
  });

  // ============================================
  // Mode switching effects
  // ============================================

  // Auto-select default tools when switching modes
  const prevEditModeRef = useRef<EditMode>('text');
  useEffect(() => {
    if (prevEditModeRef.current !== editMode) {
      if (editMode === 'annotate' && annotationMode === null) {
        setAnnotationMode('rectangle');
      } else if (editMode === 'inpaint') {
        setIsEraseMode(false);
      }
      prevEditModeRef.current = editMode;
    }
  }, [editMode, annotationMode, setAnnotationMode]);

  // Clear selection when switching away from annotate mode
  const prevModeForSelectionRef = useRef<EditMode>('text');
  useEffect(() => {
    const prevMode = prevModeForSelectionRef.current;
    if (prevMode !== editMode && prevMode === 'annotate') {
      setSelectedShapeId(null);
    }
    prevModeForSelectionRef.current = editMode;
  }, [editMode, setSelectedShapeId]);

  // ============================================
  // Handlers
  // ============================================

  const handleEnterInpaintMode = useCallback(() => {
    setIsInpaintMode(true);
  }, []);

  // Backwards compatibility setter
  const setIsAnnotateMode = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    const boolValue = typeof value === 'function' ? value(editMode === 'annotate') : value;
    setEditMode(boolValue ? 'annotate' : 'inpaint');
  }, [editMode, setEditMode]);

  // Get delete button position for selected shape
  const getDeleteButtonPosition = useCallback((): { x: number; y: number } | null => {
    if (!selectedShapeId || !displayCanvasRef.current || !canvasSize || !imageDimensions) return null;

    const selectedShape = brushStrokes.find(s => s.id === selectedShapeId);
    if (!selectedShape || !selectedShape.shapeType) return null;

    const canvas = displayCanvasRef.current;
    const rect = canvas.getBoundingClientRect();

    // Get corners in image coordinates
    const imageCorners = getRectangleCorners(selectedShape);

    // Convert corners from image coordinates to canvas coordinates
    const canvasCorners = imageCorners.map(corner => imageToCanvas(corner.x, corner.y));

    const minY = Math.min(...canvasCorners.map(c => c.y));
    const maxY = Math.max(...canvasCorners.map(c => c.y));
    const minX = Math.min(...canvasCorners.map(c => c.x));
    const maxX = Math.max(...canvasCorners.map(c => c.x));

    const buttonWidth = 80;
    const padding = 10;

    // Place button at top center of rectangle
    let buttonX = (minX + maxX) / 2;
    let buttonY = minY - 50;

    // If button would be above canvas, place it below
    if (buttonY < padding) {
      buttonY = maxY + 50;
    }

    // Clamp to canvas boundaries
    buttonX = Math.max(buttonWidth / 2 + padding, Math.min(rect.width - buttonWidth / 2 - padding, buttonX));
    buttonY = Math.max(padding, Math.min(rect.height - padding, buttonY));

    // Convert canvas coordinates to screen coordinates
    return {
      x: rect.left + buttonX,
      y: rect.top + buttonY
    };
  }, [selectedShapeId, brushStrokes, displayCanvasRef, canvasSize, imageDimensions, imageToCanvas]);

  // ============================================
  // Return public interface
  // ============================================
  return {
    // State
    isInpaintMode,
    brushStrokes,
    isEraseMode,
    inpaintPrompt,
    inpaintNumGenerations,
    brushSize,
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isDrawing,
    currentStroke,
    isAnnotateMode,
    editMode,
    annotationMode,
    selectedShapeId,
    showTextModeHint,

    // Setters
    setIsInpaintMode,
    setInpaintPrompt,
    setInpaintNumGenerations,
    setBrushSize,
    setIsEraseMode,
    setIsAnnotateMode,
    setEditMode,
    setAnnotationMode,

    // Handlers
    handleEnterInpaintMode,
    handleKonvaPointerDown,
    handleKonvaPointerMove,
    handleKonvaPointerUp,
    handleShapeClick,
    handleUndo,
    handleClearMask,
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
    handleDeleteSelected,
    handleToggleFreeForm,
    getDeleteButtonPosition,

    // Refs
    strokeOverlayRef,

    // Canvas state
    isImageLoaded,
    imageLoadError,
    redrawStrokes,
  };
};
