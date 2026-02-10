/**
 * Encapsulates drag state for shape manipulation.
 * Handles move, resize, and free-form corner dragging modes.
 * Also manages global pointer event cleanup to prevent stuck drag states.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { BrushStroke } from './types';

export type DragMode = 'move' | 'resize';

interface UseDragStateReturn {
  // State
  isDragging: boolean;
  dragOffset: { x: number; y: number } | null;
  dragMode: DragMode;
  draggingCornerIndex: number | null;
  draggedShapeRef: React.MutableRefObject<BrushStroke | null>;

  // Actions
  startMoveDrag: (shape: BrushStroke, pointerX: number, pointerY: number) => void;
  startResizeDrag: (shape: BrushStroke, pointerX: number, pointerY: number) => void;
  startCornerDrag: (shape: BrushStroke, cornerIndex: number) => void;
  endDrag: () => void;

  // For updating the shape ref during drag
  updateDraggedShape: (shape: BrushStroke) => void;
}

export function useDragState(): UseDragStateReturn {
  // Drag state
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>('resize');
  const [draggingCornerIndex, setDraggingCornerIndex] = useState<number | null>(null);

  // Ref to track the shape being dragged (for mutation during drag)
  const draggedShapeRef = useRef<BrushStroke | null>(null);

  /**
   * Start a move drag operation
   */
  const startMoveDrag = useCallback((shape: BrushStroke, pointerX: number, pointerY: number) => {
    const startPoint = shape.points[0];
    setDragMode('move');
    setIsDragging(true);
    setDragOffset({ x: pointerX - startPoint.x, y: pointerY - startPoint.y });
    setDraggingCornerIndex(null);
    draggedShapeRef.current = shape;
  }, []);

  /**
   * Start a resize drag operation (corner drag on non-free-form rectangle)
   */
  const startResizeDrag = useCallback((shape: BrushStroke, pointerX: number, pointerY: number) => {
    const startPoint = shape.points[0];
    setDragMode('resize');
    setIsDragging(true);
    setDragOffset({ x: pointerX - startPoint.x, y: pointerY - startPoint.y });
    setDraggingCornerIndex(null);
    draggedShapeRef.current = shape;
  }, []);

  /**
   * Start a free-form corner drag operation
   */
  const startCornerDrag = useCallback((shape: BrushStroke, cornerIndex: number) => {
    setDraggingCornerIndex(cornerIndex);
    setIsDragging(true);
    setDragOffset(null);
    draggedShapeRef.current = shape;
  }, []);

  /**
   * End any drag operation
   */
  const endDrag = useCallback(() => {
    setIsDragging(false);
    setDragOffset(null);
    setDraggingCornerIndex(null);
    draggedShapeRef.current = null;
  }, []);

  /**
   * Update the dragged shape ref (called during drag when shape is mutated)
   */
  const updateDraggedShape = useCallback((shape: BrushStroke) => {
    draggedShapeRef.current = shape;
  }, []);

  /**
   * Global pointer event listeners to catch pointer release outside canvas.
   * Prevents "stuck" drag state when user drags off screen edge.
   */
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalPointerUp = () => {
      endDrag();
    };

    window.addEventListener('pointerup', handleGlobalPointerUp);
    window.addEventListener('pointercancel', handleGlobalPointerUp);

    return () => {
      window.removeEventListener('pointerup', handleGlobalPointerUp);
      window.removeEventListener('pointercancel', handleGlobalPointerUp);
    };
  }, [isDragging, endDrag]);

  return {
    isDragging,
    dragOffset,
    dragMode,
    draggingCornerIndex,
    draggedShapeRef,
    startMoveDrag,
    startResizeDrag,
    startCornerDrag,
    endDrag,
    updateDraggedShape,
  };
}
