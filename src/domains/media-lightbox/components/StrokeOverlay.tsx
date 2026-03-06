/**
 * Konva-based stroke overlay for inpainting/annotation.
 *
 * useStrokeOverlayDrawing() — drawing, drag, and selection state + pointer handlers
 * StrokeOverlay             — rendering + ref (exportMask, actions)
 */

import { useImperativeHandle, forwardRef } from 'react';
import { getRectangleCorners } from '../hooks/inpainting/shapeHelpers';
import { exportStrokeMask } from './strokeOverlay/maskExport';
import { StrokeOverlayCanvas } from './strokeOverlay/StrokeOverlayCanvas';
import {
  useStrokeOverlayDrawing,
  type StrokeOverlayDrawingProps,
} from './strokeOverlay/useStrokeOverlayDrawing';

export type { BrushStroke, StrokeOverlayHandle } from '../hooks/inpainting/types';
import type { BrushStroke, StrokeOverlayHandle } from '../hooks/inpainting/types';

type StrokeOverlayProps = StrokeOverlayDrawingProps;

export const StrokeOverlay = forwardRef<StrokeOverlayHandle, StrokeOverlayProps>((props, ref) => {
  const {
    imageWidth,
    imageHeight,
    displayWidth,
    displayHeight,
    strokes,
    isEraseMode,
    brushSize,
    annotationMode,
    onStrokesChange,
  } = props;

  const {
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    currentStroke,
    selectedShapeId,
    updateSelection,
    scaleX,
    toStage,
  } = useStrokeOverlayDrawing(props);

  useImperativeHandle(ref, () => ({
    exportMask: (options?: { pixelRatio?: number }) => exportStrokeMask({
      strokes,
      imageWidth,
      imageHeight,
      pixelRatio: options?.pixelRatio,
    }),

    getSelectedShapeId: () => selectedShapeId,

    undo: () => {
      if (strokes.length > 0) onStrokesChange(strokes.slice(0, -1));
    },

    clear: () => {
      onStrokesChange([]);
      updateSelection(null);
    },

    deleteSelected: () => {
      if (!selectedShapeId) return;
      onStrokesChange(strokes.filter(s => s.id !== selectedShapeId));
      updateSelection(null);
    },

    toggleFreeForm: () => {
      if (!selectedShapeId) return;
      const shape = strokes.find(s => s.id === selectedShapeId);
      if (!shape || shape.shapeType !== 'rectangle') return;

      let updated: BrushStroke;
      if (shape.isFreeForm) {
        const corners = getRectangleCorners(shape);
        const xs = corners.map(c => c.x);
        const ys = corners.map(c => c.y);
        updated = {
          ...shape,
          points: [
            { x: Math.min(...xs), y: Math.min(...ys) },
            { x: Math.max(...xs), y: Math.max(...ys) },
          ],
          isFreeForm: false,
        };
      } else {
        updated = { ...shape, points: getRectangleCorners(shape), isFreeForm: true };
      }
      onStrokesChange(strokes.map(s => s.id === selectedShapeId ? updated : s));
    },
  }), [strokes, imageWidth, imageHeight, selectedShapeId, onStrokesChange, updateSelection]);

  return (
    <StrokeOverlayCanvas
      displayWidth={displayWidth}
      displayHeight={displayHeight}
      strokes={strokes}
      currentStroke={currentStroke}
      selectedShapeId={selectedShapeId}
      annotationMode={annotationMode}
      isEraseMode={isEraseMode}
      brushSize={brushSize}
      scaleX={scaleX}
      toStage={toStage}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    />
  );
});

StrokeOverlay.displayName = 'StrokeOverlay';
