/**
 * User action handlers for inpainting: undo, clear, delete, toggle free-form.
 * Also handles keyboard shortcuts.
 */

import { useCallback, useEffect } from 'react';
import type { BrushStroke } from './types';
import { getRectangleCorners } from './shapeHelpers';

interface UseInpaintActionsProps {
  // State
  isInpaintMode: boolean;
  isAnnotateMode: boolean;
  brushStrokes: BrushStroke[];
  selectedShapeId: string | null;
  // Setters
  setInpaintStrokes: React.Dispatch<React.SetStateAction<BrushStroke[]>>;
  setAnnotationStrokes: React.Dispatch<React.SetStateAction<BrushStroke[]>>;
  setSelectedShapeId: React.Dispatch<React.SetStateAction<string | null>>;
  // Callbacks
  redrawStrokes: (strokes: BrushStroke[]) => void;
}

export function useInpaintActions({
  isInpaintMode,
  isAnnotateMode,
  brushStrokes,
  selectedShapeId,
  setInpaintStrokes,
  setAnnotationStrokes,
  setSelectedShapeId,
  redrawStrokes,
}: UseInpaintActionsProps) {
  /**
   * Undo last stroke
   */
  const handleUndo = useCallback(() => {
    if (brushStrokes.length === 0) return;

    const newStrokes = brushStrokes.slice(0, -1);
    // Update the correct array based on mode
    if (isAnnotateMode) {
      setAnnotationStrokes(newStrokes);
    } else {
      setInpaintStrokes(newStrokes);
    }
    redrawStrokes(newStrokes);

  }, [brushStrokes, redrawStrokes, isAnnotateMode, setInpaintStrokes, setAnnotationStrokes]);

  /**
   * Clear all strokes
   */
  const handleClearMask = useCallback(() => {
    // Clear the correct array based on mode
    if (isAnnotateMode) {
      setAnnotationStrokes([]);
    } else {
      setInpaintStrokes([]);
    }
    setSelectedShapeId(null);
    redrawStrokes([]);
  }, [redrawStrokes, isAnnotateMode, setInpaintStrokes, setAnnotationStrokes, setSelectedShapeId]);

  /**
   * Delete selected shape
   */
  const handleDeleteSelected = useCallback(() => {
    if (!selectedShapeId) return;

    const newStrokes = brushStrokes.filter(s => s.id !== selectedShapeId);
    // Update the correct array based on mode
    if (isAnnotateMode) {
      setAnnotationStrokes(newStrokes);
    } else {
      setInpaintStrokes(newStrokes);
    }
    setSelectedShapeId(null);
    redrawStrokes(newStrokes);

  }, [selectedShapeId, brushStrokes, redrawStrokes, isAnnotateMode, setInpaintStrokes, setAnnotationStrokes, setSelectedShapeId]);

  /**
   * Toggle free-form mode for selected rectangle
   */
  const handleToggleFreeForm = useCallback(() => {
    if (!selectedShapeId) return;

    const selectedShape = brushStrokes.find(s => s.id === selectedShapeId);
    if (!selectedShape || selectedShape.shapeType !== 'rectangle') return;

    let updatedShape: BrushStroke;

    if (selectedShape.isFreeForm) {
      // Convert back to regular rectangle (use bounding box)
      const corners = getRectangleCorners(selectedShape);
      const minX = Math.min(...corners.map(c => c.x));
      const maxX = Math.max(...corners.map(c => c.x));
      const minY = Math.min(...corners.map(c => c.y));
      const maxY = Math.max(...corners.map(c => c.y));

      updatedShape = {
        ...selectedShape,
        points: [{ x: minX, y: minY }, { x: maxX, y: maxY }],
        isFreeForm: false
      };
    } else {
      // Convert to free-form (4 independent corners)
      const corners = getRectangleCorners(selectedShape);
      updatedShape = {
        ...selectedShape,
        points: corners,
        isFreeForm: true
      };
    }

    const newStrokes = brushStrokes.map(s => s.id === selectedShapeId ? updatedShape : s);

    if (isAnnotateMode) {
      setAnnotationStrokes(newStrokes);
    } else {
      setInpaintStrokes(newStrokes);
    }

    redrawStrokes(newStrokes);
  }, [selectedShapeId, brushStrokes, isAnnotateMode, redrawStrokes, setInpaintStrokes, setAnnotationStrokes]);

  /**
   * Keyboard handler for DELETE key
   */
  useEffect(() => {
    if (!isInpaintMode || !isAnnotateMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't handle keyboard shortcuts if user is typing in an input field
      const target = e.target as HTMLElement;
      const isTyping = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.contentEditable === 'true' ||
        target.isContentEditable
      );

      if (isTyping) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShapeId) {
        e.preventDefault();
        handleDeleteSelected();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isInpaintMode, isAnnotateMode, selectedShapeId, handleDeleteSelected]);

  return {
    handleUndo,
    handleClearMask,
    handleDeleteSelected,
    handleToggleFreeForm,
  };
}
