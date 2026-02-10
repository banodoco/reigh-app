/**
 * useInpainting - Main hook for inpainting functionality
 *
 * This is the orchestrator that composes several sub-hooks:
 * - useMediaPersistence: Handles localStorage, in-memory cache, and DB persistence
 * - useInpaintActions: Handles user actions (undo, clear, delete, etc.)
 * - useTaskGeneration: Handles task creation for inpaint/annotate edits
 *
 * StrokeOverlay owns the drawing state machine (pointer handlers, drag state).
 * This hook provides callbacks that StrokeOverlay invokes when strokes change.
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
} from './inpainting/types';

// Import sub-hooks
import { useMediaPersistence } from './inpainting/useMediaPersistence';
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
  handleExitInpaintMode,
  loras,
  activeVariantId,
  activeVariantLocation,
  createAsGeneration,
  advancedSettings,
  qwenEditModel,
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

  // Selection state (owned here, synced via onSelectionChange callback from StrokeOverlay)
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

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

  // ============================================
  // StrokeOverlay callbacks
  // ============================================

  /**
   * Called when a new stroke is completed (drawn and released).
   * Appends to the correct stroke array based on current mode.
   */
  const onStrokeComplete = useCallback((stroke: BrushStroke) => {
    if (isAnnotateMode) {
      // In annotate+rectangle mode, limit to one rectangle
      if (stroke.shapeType === 'rectangle' && annotationStrokes.length > 0) {
        setAnnotationStrokes([stroke]);
      } else {
        setAnnotationStrokes(prev => [...prev, stroke]);
      }
    } else {
      setInpaintStrokes(prev => [...prev, stroke]);
    }
  }, [isAnnotateMode, annotationStrokes.length, setAnnotationStrokes, setInpaintStrokes]);

  /**
   * Called when strokes are mutated in place (drag/resize/free-form).
   * Replaces the entire stroke array for the current mode.
   */
  const onStrokesChange = useCallback((newStrokes: BrushStroke[]) => {
    if (isAnnotateMode) {
      setAnnotationStrokes(newStrokes);
    } else {
      setInpaintStrokes(newStrokes);
    }
  }, [isAnnotateMode, setAnnotationStrokes, setInpaintStrokes]);

  /**
   * Called when selection changes inside StrokeOverlay.
   */
  const onSelectionChange = useCallback((shapeId: string | null) => {
    setSelectedShapeId(shapeId);
  }, []);

  /**
   * Called when user tries to draw in text mode.
   */
  const onTextModeHint = useCallback(() => {
    setShowTextModeHint(true);
    setTimeout(() => setShowTextModeHint(false), 2000);
  }, []);

  // ============================================
  // User Actions (delegate to StrokeOverlay ref)
  // ============================================
  const handleUndo = useCallback(() => {
    strokeOverlayRef.current?.undo();
  }, []);

  const handleClearMask = useCallback(() => {
    strokeOverlayRef.current?.clear();
  }, []);

  const handleDeleteSelected = useCallback(() => {
    strokeOverlayRef.current?.deleteSelected();
  }, []);

  const handleToggleFreeForm = useCallback(() => {
    strokeOverlayRef.current?.toggleFreeForm();
  }, []);

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
  }, [editMode]);

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
    if (!selectedShapeId || !imageDimensions) return null;

    const selectedShape = brushStrokes.find(s => s.id === selectedShapeId);
    if (!selectedShape || !selectedShape.shapeType) return null;

    // Get display dimensions from StrokeOverlay's stage container
    const stageContainer = strokeOverlayRef.current
      ? (document.querySelector('[data-lightbox-bg] .konvajs-content') as HTMLElement)
      : null;
    if (!stageContainer) return null;

    const rect = stageContainer.getBoundingClientRect();
    const displayWidth = rect.width;
    const displayHeight = rect.height;
    if (displayWidth === 0 || displayHeight === 0) return null;

    // Get corners in image coordinates, convert to display coordinates
    const imageCorners = getRectangleCorners(selectedShape);
    const displayCorners = imageCorners.map(corner => ({
      x: (corner.x / imageDimensions.width) * displayWidth,
      y: (corner.y / imageDimensions.height) * displayHeight,
    }));

    const minY = Math.min(...displayCorners.map(c => c.y));
    const maxY = Math.max(...displayCorners.map(c => c.y));
    const minX = Math.min(...displayCorners.map(c => c.x));
    const maxX = Math.max(...displayCorners.map(c => c.x));

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
    buttonX = Math.max(buttonWidth / 2 + padding, Math.min(displayWidth - buttonWidth / 2 - padding, buttonX));
    buttonY = Math.max(padding, Math.min(displayHeight - padding, buttonY));

    // Convert display coordinates to screen coordinates
    return {
      x: rect.left + buttonX,
      y: rect.top + buttonY
    };
  }, [selectedShapeId, brushStrokes, imageDimensions, strokeOverlayRef]);

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
    handleUndo,
    handleClearMask,
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
    handleDeleteSelected,
    handleToggleFreeForm,
    getDeleteButtonPosition,

    // StrokeOverlay callbacks
    onStrokeComplete,
    onStrokesChange,
    onSelectionChange,
    onTextModeHint,

    // Refs
    strokeOverlayRef,

    // Canvas state
    isImageLoaded,
    imageLoadError,
  };
};
