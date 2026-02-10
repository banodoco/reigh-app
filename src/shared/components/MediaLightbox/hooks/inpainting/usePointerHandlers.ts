/**
 * Pointer event handlers for Konva-based drawing.
 * Handles stroke drawing, shape selection, and drag operations.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { nanoid } from 'nanoid';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { BrushStroke, EditMode, AnnotationMode } from './types';
import { isPointOnShape, getClickedCornerIndex, getRectangleClickType, getRectangleCorners } from './shapeHelpers';
import { useDragState } from './useDragState';

interface UsePointerHandlersProps {
  // Mode state
  isInpaintMode: boolean;
  editMode: EditMode;
  annotationMode: AnnotationMode;
  isAnnotateMode: boolean;
  // Drawing state
  brushStrokes: BrushStroke[];
  annotationStrokes: BrushStroke[];
  isEraseMode: boolean;
  brushSize: number;
  // Setters
  setBrushStrokes: React.Dispatch<React.SetStateAction<BrushStroke[]>>;
  setAnnotationStrokes: React.Dispatch<React.SetStateAction<BrushStroke[]>>;
  // Text mode hint
  setShowTextModeHint: React.Dispatch<React.SetStateAction<boolean>>;
}

interface UsePointerHandlersReturn {
  // Drawing state
  isDrawing: boolean;
  currentStroke: Array<{ x: number; y: number }>;
  selectedShapeId: string | null;
  setSelectedShapeId: React.Dispatch<React.SetStateAction<string | null>>;
  // Handlers
  handleKonvaPointerDown: (point: { x: number; y: number }, e: KonvaEventObject<PointerEvent>) => void;
  handleKonvaPointerMove: (point: { x: number; y: number }, e: KonvaEventObject<PointerEvent>) => void;
  handleKonvaPointerUp: (e: KonvaEventObject<PointerEvent>) => void;
  handleShapeClick: (strokeId: string, point: { x: number; y: number }) => void;
}

export function usePointerHandlers({
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
}: UsePointerHandlersProps): UsePointerHandlersReturn {
  // Drawing state
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Array<{ x: number; y: number }>>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  // Refs for synchronous access in pointer event handlers.
  // React state updates are asynchronous, so useCallback closures may see stale
  // values when pointer events fire in rapid succession (down → move → up).
  // These refs provide the ground truth for the hot path.
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Array<{ x: number; y: number }>>([]);

  // Drag state (encapsulated in useDragState hook)
  const {
    isDragging: isDraggingShape,
    dragOffset,
    dragMode,
    draggingCornerIndex,
    draggedShapeRef,
    startMoveDrag,
    startResizeDrag,
    startCornerDrag,
    endDrag,
    updateDraggedShape,
  } = useDragState();

  // Refs for tracking
  const lastClickTimeRef = useRef<number>(0);
  const lastClickPositionRef = useRef<{ x: number; y: number } | null>(null);
  const dragStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const hintTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasInitializedCanvasRef = useRef<boolean>(false);
  const lastDrawnPointRef = useRef<{ x: number; y: number } | null>(null);

  // Cleanup hint timeout on unmount
  useEffect(() => {
    return () => {
      if (hintTimeoutRef.current) {
        clearTimeout(hintTimeoutRef.current);
        hintTimeoutRef.current = null;
      }
    };
  }, []);

  /**
   * Handle pointer down - start drawing or select/drag shape
   */
  const handleKonvaPointerDown = useCallback((point: { x: number; y: number }, e: KonvaEventObject<PointerEvent>) => {
    const { x, y } = point;

    // Allow both inpaint mode and annotate mode
    if (!isInpaintMode && !isAnnotateMode) return;

    // Prevent drawing in text edit mode
    if (editMode === 'text') {
      setShowTextModeHint(true);
      if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
      hintTimeoutRef.current = setTimeout(() => {
        setShowTextModeHint(false);
        hintTimeoutRef.current = null;
      }, 2000);
      return;
    }

    // Store drag start position for tap detection
    dragStartPosRef.current = { x, y };

    // In annotate mode, check if clicking on existing shape
    if (isAnnotateMode && annotationMode === 'rectangle') {
      for (let i = brushStrokes.length - 1; i >= 0; i--) {
        const stroke = brushStrokes[i];
        if (stroke.shapeType === 'rectangle' && isPointOnShape(x, y, stroke)) {
          setSelectedShapeId(stroke.id);

          // Check for corner click (for free-form dragging)
          const now = Date.now();
          const cornerIndex = getClickedCornerIndex(x, y, stroke);
          const lastClickPos = lastClickPositionRef.current;
          const isDoubleClick = cornerIndex !== null &&
            now - lastClickTimeRef.current < 300 &&
            lastClickPos &&
            Math.hypot(x - lastClickPos.x, y - lastClickPos.y) < 10;

          lastClickTimeRef.current = now;
          lastClickPositionRef.current = { x, y };

          // Free-form corner dragging
          if (stroke.isFreeForm && cornerIndex !== null) {
            startCornerDrag(stroke, cornerIndex);
            return;
          }

          // Double-click to enable free-form mode
          if (isDoubleClick && cornerIndex !== null && !stroke.isFreeForm) {
            const corners = getRectangleCorners(stroke);
            const updatedStroke: BrushStroke = {
              ...stroke,
              points: corners,
              isFreeForm: true
            };
            const newStrokes = brushStrokes.map(s => s.id === stroke.id ? updatedStroke : s);
            setBrushStrokes(newStrokes);
            startCornerDrag(updatedStroke, cornerIndex);
            return;
          }

          // Determine if clicking edge (move) or corner (resize)
          const clickType = getRectangleClickType(x, y, stroke);

          if (clickType === 'edge') {
            startMoveDrag(stroke, x, y);
            return;
          } else if (clickType === 'corner' && !stroke.isFreeForm) {
            startResizeDrag(stroke, x, y);
            return;
          }

          return; // Clicked in middle, just keep selected
        }
      }

      // Clicked on empty space, deselect
      if (selectedShapeId) {
        setSelectedShapeId(null);
      }
    }

    // Start new stroke
    isDrawingRef.current = true;
    setIsDrawing(true);
    hasInitializedCanvasRef.current = false;
    lastDrawnPointRef.current = null;
    const initialStroke = [{ x, y }];
    currentStrokeRef.current = initialStroke;
    setCurrentStroke(initialStroke);
  }, [isInpaintMode, isAnnotateMode, annotationMode, brushStrokes, selectedShapeId, editMode, setBrushStrokes, setShowTextModeHint, startCornerDrag, startMoveDrag, startResizeDrag]);

  /**
   * Handle pointer move - continue drawing or dragging
   */
  const handleKonvaPointerMove = useCallback((point: { x: number; y: number }, e: KonvaEventObject<PointerEvent>) => {
    // Allow both inpaint mode and annotate mode
    if (!isInpaintMode && !isAnnotateMode) return;
    if (editMode === 'text' && !isDraggingShape) return;

    const { x, y } = point;

    // Handle dragging selected shape
    if (isDraggingShape && draggedShapeRef.current) {
      const shape = draggedShapeRef.current;

      // Free-form corner dragging
      if (draggingCornerIndex !== null && shape.isFreeForm && shape.points.length === 4) {
        const newPoints = [...shape.points];
        newPoints[draggingCornerIndex] = { x, y };

        const updatedShape: BrushStroke = {
          ...shape,
          points: newPoints,
          isFreeForm: true
        };

        const newStrokes = brushStrokes.map(s => s.id === shape.id ? updatedShape : s);
        setBrushStrokes(newStrokes);
        updateDraggedShape(updatedShape);
        return;
      }

      // Move mode
      if (dragMode === 'move' && dragOffset) {
        const newStartX = x - dragOffset.x;
        const newStartY = y - dragOffset.y;
        const oldStartPoint = shape.points[0];
        const deltaX = newStartX - oldStartPoint.x;
        const deltaY = newStartY - oldStartPoint.y;

        const updatedPoints = shape.points.map(p => ({
          x: p.x + deltaX,
          y: p.y + deltaY
        }));

        const updatedShape: BrushStroke = {
          ...shape,
          points: updatedPoints,
          isFreeForm: shape.isFreeForm
        };

        const newStrokes = brushStrokes.map(s => s.id === shape.id ? updatedShape : s);
        setBrushStrokes(newStrokes);
        updateDraggedShape(updatedShape);
        return;
      }

      // Resize mode
      if (dragMode === 'resize' && !shape.isFreeForm) {
        const endPoint = shape.points[1];
        const updatedShape: BrushStroke = {
          ...shape,
          points: [{ x, y }, endPoint]
        };

        const newStrokes = brushStrokes.map(s => s.id === shape.id ? updatedShape : s);
        setBrushStrokes(newStrokes);
        updateDraggedShape(updatedShape);
        return;
      }
    }

    // Continue drawing stroke (use ref for synchronous check)
    if (!isDrawingRef.current) return;

    const newStroke = [...currentStrokeRef.current, { x, y }];
    currentStrokeRef.current = newStroke;
    setCurrentStroke(newStroke);
  }, [isInpaintMode, isAnnotateMode, editMode, isDraggingShape, dragMode, dragOffset, draggingCornerIndex, brushStrokes, setBrushStrokes, updateDraggedShape]);

  /**
   * Handle pointer up - finish drawing or dragging
   */
  const handleKonvaPointerUp = useCallback((e: KonvaEventObject<PointerEvent>) => {
    // Handle finishing drag operation
    if (isDraggingShape) {
      endDrag();
      return;
    }

    // Allow both inpaint mode and annotate mode
    if ((!isInpaintMode && !isAnnotateMode) || !isDrawingRef.current) return;
    if (editMode === 'text') return;

    isDrawingRef.current = false;
    setIsDrawing(false);
    hasInitializedCanvasRef.current = false;
    lastDrawnPointRef.current = null;

    // Read stroke from ref (synchronous, not stale closure)
    const finalStroke = currentStrokeRef.current;

    if (finalStroke.length > 1) {
      const shapeType = isAnnotateMode && annotationMode ? annotationMode : 'line';

      // For rectangles, require minimum drag distance
      if (shapeType === 'rectangle') {
        const startPoint = finalStroke[0];
        const endPoint = finalStroke[finalStroke.length - 1];
        const dragDistance = Math.hypot(endPoint.x - startPoint.x, endPoint.y - startPoint.y);
        if (dragDistance < 10) {
          currentStrokeRef.current = [];
          setCurrentStroke([]);
          return;
        }
      }

      const strokePoints = shapeType === 'rectangle'
        ? [finalStroke[0], finalStroke[finalStroke.length - 1]]
        : finalStroke;

      const newStroke: BrushStroke = {
        id: nanoid(),
        points: strokePoints,
        isErasing: isEraseMode,
        brushSize: brushSize,
        shapeType
      };

      // Limit to one rectangle in annotate mode
      if (isAnnotateMode && shapeType === 'rectangle' && annotationStrokes.length > 0) {
        setAnnotationStrokes([newStroke]);
      } else {
        if (isAnnotateMode) {
          setAnnotationStrokes(prev => [...prev, newStroke]);
        } else {
          setBrushStrokes(prev => [...prev, newStroke]);
        }
      }

      // Auto-select rectangle after drawing
      if (isAnnotateMode && shapeType === 'rectangle') {
        setSelectedShapeId(newStroke.id);
      }

    }

    currentStrokeRef.current = [];
    setCurrentStroke([]);
  }, [isInpaintMode, isAnnotateMode, isEraseMode, brushSize, annotationMode, isDraggingShape, editMode, annotationStrokes.length, setBrushStrokes, setAnnotationStrokes, endDrag]);

  /**
   * Handle shape click (from StrokeOverlay)
   */
  const handleShapeClick = useCallback((strokeId: string, point: { x: number; y: number }) => {
    setSelectedShapeId(strokeId);
  }, []);

  /**
   * Global pointerup listener to catch pointer release outside canvas
   * Prevents "stuck" drawing state when dragging off the edge of the screen
   * Note: Drag cleanup is handled by useDragState's own effect
   */
  useEffect(() => {
    if (!isDrawing) return;

    const handleGlobalPointerUp = () => {
      isDrawingRef.current = false;
      setIsDrawing(false);
      hasInitializedCanvasRef.current = false;
      lastDrawnPointRef.current = null;
      currentStrokeRef.current = [];
      setCurrentStroke([]);
    };

    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);

    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, [isDrawing]);

  return {
    isDrawing,
    currentStroke,
    selectedShapeId,
    setSelectedShapeId,
    handleKonvaPointerDown,
    handleKonvaPointerMove,
    handleKonvaPointerUp,
    handleShapeClick,
  };
}
