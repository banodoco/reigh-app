/**
 * Konva-based stroke overlay for inpainting/annotation.
 *
 * useDrawing()    — drawing, drag, and selection state + pointer handlers
 * StrokeOverlay   — rendering + ref (exportMask, actions)
 */

import { useState, useRef, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import { Stage, Layer, Line, Rect } from 'react-konva';
import Konva from 'konva';
import { nanoid } from 'nanoid';
import type { KonvaEventObject } from 'konva/lib/Node';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { isPointOnShape, getClickedCornerIndex, getRectangleClickType, getRectangleCorners } from '../hooks/inpainting/shapeHelpers';

export type { BrushStroke, StrokeOverlayHandle } from '../hooks/inpainting/types';
import type { BrushStroke, StrokeOverlayHandle } from '../hooks/inpainting/types';

interface StrokeOverlayProps {
  imageWidth: number;
  imageHeight: number;
  displayWidth: number;
  displayHeight: number;
  strokes: BrushStroke[];
  isEraseMode: boolean;
  brushSize: number;
  annotationMode: 'rectangle' | null;
  isInpaintMode: boolean;
  isAnnotateMode: boolean;
  editMode: 'text' | 'inpaint' | 'annotate' | 'reposition' | 'img2img';
  onStrokeComplete: (stroke: BrushStroke) => void;
  onStrokesChange: (strokes: BrushStroke[]) => void;
  onSelectionChange: (shapeId: string | null) => void;
  onTextModeHint?: () => void;
}

type DragMode = 'move' | 'resize';

/** Clamped pointer position from a Konva event, in stage coordinates. */
function getClampedPos(
  e: KonvaEventObject<PointerEvent>,
  w: number,
  h: number,
): { x: number; y: number } | null {
  const stage = e.target.getStage();
  if (!stage) return null;

  const clamp = (v: number, max: number) => Math.max(0, Math.min(max, v));

  const p = stage.getPointerPosition();
  if (p) return { x: clamp(p.x, w), y: clamp(p.y, h) };

  const container = stage.container();
  if (!container) return null;
  const rect = container.getBoundingClientRect();
  return { x: clamp(e.evt.clientX - rect.left, w), y: clamp(e.evt.clientY - rect.top, h) };
}


function useDrawing({
  displayWidth, displayHeight, imageWidth, imageHeight,
  strokes, isEraseMode, brushSize, annotationMode,
  isInpaintMode, isAnnotateMode, editMode,
  onStrokeComplete, onStrokesChange, onSelectionChange, onTextModeHint,
}: StrokeOverlayProps) {

  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<Array<{ x: number; y: number }>>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  // Refs mirror state for synchronous reads inside pointer handlers,
  // where React's async state updates would give stale values.
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<Array<{ x: number; y: number }>>([]);

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>('resize');
  const [draggingCornerIndex, setDraggingCornerIndex] = useState<number | null>(null);
  const draggedShapeRef = useRef<BrushStroke | null>(null);

  const lastClickTimeRef = useRef(0);
  const lastClickPosRef = useRef<{ x: number; y: number } | null>(null);

  const scaleX = imageWidth > 0 ? displayWidth / imageWidth : 1;
  const scaleY = imageHeight > 0 ? displayHeight / imageHeight : 1;

  const toImage = useCallback(
    (sx: number, sy: number) => ({ x: sx / scaleX, y: sy / scaleY }),
    [scaleX, scaleY],
  );

  const toStage = useCallback(
    (ix: number, iy: number) => ({ x: ix * scaleX, y: iy * scaleY }),
    [scaleX, scaleY],
  );

  const updateSelection = useCallback((id: string | null) => {
    setSelectedShapeId(id);
    onSelectionChange(id);
  }, [onSelectionChange]);

  const startDrag = useCallback((
    shape: BrushStroke, mode: DragMode, pointerX: number, pointerY: number, corner?: number,
  ) => {
    setDragMode(mode);
    setIsDragging(true);
    setDraggingCornerIndex(corner ?? null);
    setDragOffset(corner != null ? null : { x: pointerX - shape.points[0].x, y: pointerY - shape.points[0].y });
    draggedShapeRef.current = shape;
  }, []);

  const endDrag = useCallback(() => {
    setIsDragging(false);
    setDragOffset(null);
    setDraggingCornerIndex(null);
    draggedShapeRef.current = null;
  }, []);

  // Hit-test shapes in annotate mode. Returns true if a shape handled the click.
  const hitTestShapes = useCallback((x: number, y: number): boolean => {
    for (let i = strokes.length - 1; i >= 0; i--) {
      const stroke = strokes[i];
      if (stroke.shapeType !== 'rectangle' || !isPointOnShape(x, y, stroke)) continue;

      updateSelection(stroke.id);

      const now = Date.now();
      const cornerIdx = getClickedCornerIndex(x, y, stroke);
      const lastPos = lastClickPosRef.current;
      const isDoubleClick = cornerIdx !== null
        && now - lastClickTimeRef.current < 300
        && lastPos && Math.hypot(x - lastPos.x, y - lastPos.y) < 10;

      lastClickTimeRef.current = now;
      lastClickPosRef.current = { x, y };

      if (stroke.isFreeForm && cornerIdx !== null) {
        startDrag(stroke, 'resize', x, y, cornerIdx);
        return true;
      }

      // Double-click corner converts to free-form
      if (isDoubleClick && cornerIdx !== null && !stroke.isFreeForm) {
        const corners = getRectangleCorners(stroke);
        const freeForm: BrushStroke = { ...stroke, points: corners, isFreeForm: true };
        onStrokesChange(strokes.map(s => s.id === stroke.id ? freeForm : s));
        startDrag(freeForm, 'resize', x, y, cornerIdx);
        return true;
      }

      const clickType = getRectangleClickType(x, y, stroke);
      if (clickType === 'edge') { startDrag(stroke, 'move', x, y); return true; }
      if (clickType === 'corner' && !stroke.isFreeForm) { startDrag(stroke, 'resize', x, y); return true; }
      return true; // middle — just selected, no drag
    }
    return false;
  }, [strokes, onStrokesChange, updateSelection, startDrag]);

  const handlePointerDown = useCallback((e: KonvaEventObject<PointerEvent>) => {
    const pos = getClampedPos(e, displayWidth, displayHeight);
    if (!pos) return;

    const stage = e.target.getStage();
    if (stage?.content && e.evt.pointerId !== undefined) {
      try { stage.content.setPointerCapture(e.evt.pointerId); } catch { /* ok */ }
    }

    if (!isInpaintMode && !isAnnotateMode) return;

    if (editMode === 'text') {
      onTextModeHint?.();
      return;
    }

    const { x, y } = toImage(pos.x, pos.y);

    if (isAnnotateMode && annotationMode === 'rectangle') {
      if (hitTestShapes(x, y)) return;
      if (selectedShapeId) updateSelection(null);
    }

    isDrawingRef.current = true;
    setIsDrawing(true);
    currentStrokeRef.current = [{ x, y }];
    setCurrentStroke([{ x, y }]);
  }, [displayWidth, displayHeight, isInpaintMode, isAnnotateMode, annotationMode,
      selectedShapeId, editMode, onTextModeHint, toImage, hitTestShapes, updateSelection]);

  const handlePointerMove = useCallback((e: KonvaEventObject<PointerEvent>) => {
    if (!isInpaintMode && !isAnnotateMode) return;
    if (editMode === 'text' && !isDragging) return;

    const pos = getClampedPos(e, displayWidth, displayHeight);
    if (!pos) return;
    const { x, y } = toImage(pos.x, pos.y);

    if (isDragging && draggedShapeRef.current) {
      const shape = draggedShapeRef.current;
      let updated: BrushStroke | null = null;

      if (draggingCornerIndex !== null && shape.isFreeForm && shape.points.length === 4) {
        const pts = [...shape.points];
        pts[draggingCornerIndex] = { x, y };
        updated = { ...shape, points: pts, isFreeForm: true };
      } else if (dragMode === 'move' && dragOffset) {
        const dx = (x - dragOffset.x) - shape.points[0].x;
        const dy = (y - dragOffset.y) - shape.points[0].y;
        updated = { ...shape, points: shape.points.map(p => ({ x: p.x + dx, y: p.y + dy })), isFreeForm: shape.isFreeForm };
      } else if (dragMode === 'resize' && !shape.isFreeForm) {
        updated = { ...shape, points: [{ x, y }, shape.points[1]] };
      }

      if (updated) {
        onStrokesChange(strokes.map(s => s.id === shape.id ? updated : s));
        draggedShapeRef.current = updated;
      }
      return;
    }

    if (!isDrawingRef.current) return;
    const next = [...currentStrokeRef.current, { x, y }];
    currentStrokeRef.current = next;
    setCurrentStroke(next);
  }, [isInpaintMode, isAnnotateMode, editMode, isDragging, dragMode, dragOffset,
      draggingCornerIndex, strokes, displayWidth, displayHeight, onStrokesChange, toImage]);

  const handlePointerUp = useCallback((e: KonvaEventObject<PointerEvent>) => {
    const stage = e.target.getStage();
    if (stage?.content && e.evt.pointerId !== undefined) {
      try { stage.content.releasePointerCapture(e.evt.pointerId); } catch { /* ok */ }
    }

    if (isDragging) { endDrag(); return; }

    if ((!isInpaintMode && !isAnnotateMode) || !isDrawingRef.current) return;
    if (editMode === 'text') return;

    isDrawingRef.current = false;
    setIsDrawing(false);

    const pts = currentStrokeRef.current;
    if (pts.length > 1) {
      const shapeType = isAnnotateMode && annotationMode ? annotationMode : 'line';

      if (shapeType === 'rectangle') {
        if (Math.hypot(pts[pts.length - 1].x - pts[0].x, pts[pts.length - 1].y - pts[0].y) < 10) {
          currentStrokeRef.current = [];
          setCurrentStroke([]);
          return;
        }
      }

      const stroke: BrushStroke = {
        id: nanoid(),
        points: shapeType === 'rectangle' ? [pts[0], pts[pts.length - 1]] : pts,
        isErasing: isEraseMode,
        brushSize,
        shapeType,
      };

      onStrokeComplete(stroke);
      if (isAnnotateMode && shapeType === 'rectangle') updateSelection(stroke.id);
    }

    currentStrokeRef.current = [];
    setCurrentStroke([]);
  }, [isInpaintMode, isAnnotateMode, isEraseMode, brushSize, annotationMode,
      isDragging, editMode, endDrag, onStrokeComplete, updateSelection]);

  // Safety net: if pointer is released outside the stage (or the event is lost),
  // clean up drawing/drag state so we don't get stuck.
  useEffect(() => {
    if (!isDrawing && !isDragging) return;

    const cleanup = () => {
      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        setIsDrawing(false);
        currentStrokeRef.current = [];
        setCurrentStroke([]);
      }
      if (isDragging) endDrag();
    };

    window.addEventListener('pointerup', cleanup);
    window.addEventListener('pointercancel', cleanup);
    return () => {
      window.removeEventListener('pointerup', cleanup);
      window.removeEventListener('pointercancel', cleanup);
    };
  }, [isDrawing, isDragging, endDrag]);

  // Delete/Backspace deletes the selected shape in annotate mode
  useEffect(() => {
    if (!isInpaintMode || !isAnnotateMode) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t?.tagName === 'INPUT' || t?.tagName === 'TEXTAREA' || t?.isContentEditable) return;

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedShapeId) {
        e.preventDefault();
        onStrokesChange(strokes.filter(s => s.id !== selectedShapeId));
        updateSelection(null);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isInpaintMode, isAnnotateMode, selectedShapeId, strokes, onStrokesChange, updateSelection]);

  return {
    handlePointerDown, handlePointerMove, handlePointerUp,
    currentStroke, selectedShapeId, updateSelection,
    scaleX, scaleY, toStage,
  };
}


export const StrokeOverlay = forwardRef<StrokeOverlayHandle, StrokeOverlayProps>((props, ref) => {
  const {
    imageWidth, imageHeight, displayWidth, displayHeight,
    strokes, isEraseMode, brushSize, annotationMode,
    onStrokesChange,
  } = props;

  const stageRef = useRef<Konva.Stage>(null);

  const {
    handlePointerDown, handlePointerMove, handlePointerUp,
    currentStroke, selectedShapeId, updateSelection,
    scaleX, toStage,
  } = useDrawing(props);

  useImperativeHandle(ref, () => ({
    exportMask: (options?: { pixelRatio?: number }) => {
      const pixelRatio = options?.pixelRatio ?? 1.5;
      if (strokes.length === 0) return null;

      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      document.body.appendChild(container);

      try {
        const stage = new Konva.Stage({ container, width: imageWidth, height: imageHeight });
        const layer = new Konva.Layer();
        stage.add(layer);
        layer.add(new Konva.Rect({ x: 0, y: 0, width: imageWidth, height: imageHeight, fill: 'black' }));

        const sw = 6;
        for (const stroke of strokes) {
          if (stroke.points.length < 2) continue;
          if (stroke.shapeType === 'rectangle') {
            if (stroke.isFreeForm && stroke.points.length === 4) {
              layer.add(new Konva.Line({
                points: stroke.points.flatMap(p => [p.x, p.y]),
                stroke: 'white', strokeWidth: sw, closed: true, lineCap: 'round', lineJoin: 'round',
              }));
            } else {
              const x = Math.min(stroke.points[0].x, stroke.points[1].x);
              const y = Math.min(stroke.points[0].y, stroke.points[1].y);
              layer.add(new Konva.Rect({
                x, y,
                width: Math.abs(stroke.points[1].x - stroke.points[0].x),
                height: Math.abs(stroke.points[1].y - stroke.points[0].y),
                stroke: 'white', strokeWidth: sw,
              }));
            }
          } else {
            layer.add(new Konva.Line({
              points: stroke.points.flatMap(p => [p.x, p.y]),
              stroke: 'white', strokeWidth: stroke.brushSize, lineCap: 'round', lineJoin: 'round',
            }));
          }
        }

        layer.draw();
        const dataUrl = stage.toDataURL({ pixelRatio, mimeType: 'image/png' });
        stage.destroy();
        document.body.removeChild(container);
        return dataUrl;
      } catch (error) {
        handleError(error, { context: 'StrokeOverlay', showToast: false });
        document.body.removeChild(container);
        return null;
      }
    },

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
        const xs = corners.map(c => c.x), ys = corners.map(c => c.y);
        updated = { ...shape, points: [{ x: Math.min(...xs), y: Math.min(...ys) }, { x: Math.max(...xs), y: Math.max(...ys) }], isFreeForm: false };
      } else {
        updated = { ...shape, points: getRectangleCorners(shape), isFreeForm: true };
      }
      onStrokesChange(strokes.map(s => s.id === selectedShapeId ? updated : s));
    },
  }), [strokes, imageWidth, imageHeight, selectedShapeId, onStrokesChange, updateSelection]);

  const renderStroke = (stroke: BrushStroke) => {
    const isSelected = stroke.id === selectedShapeId;
    const color = isSelected ? 'rgba(0, 255, 100, 0.9)'
      : stroke.isErasing ? 'rgba(0, 0, 0, 0.5)'
      : 'rgba(255, 0, 0, 0.7)';

    if (stroke.shapeType === 'rectangle' && stroke.points.length >= 2) {
      if (stroke.isFreeForm && stroke.points.length === 4) {
        return (
          <Line
            key={stroke.id}
            points={stroke.points.flatMap(p => { const s = toStage(p.x, p.y); return [s.x, s.y]; })}
            stroke={color} strokeWidth={3} closed
          />
        );
      }
      const p0 = toStage(stroke.points[0].x, stroke.points[0].y);
      const p1 = toStage(stroke.points[1].x, stroke.points[1].y);
      return (
        <Rect
          key={stroke.id}
          x={Math.min(p0.x, p1.x)} y={Math.min(p0.y, p1.y)}
          width={Math.abs(p1.x - p0.x)} height={Math.abs(p1.y - p0.y)}
          stroke={color} strokeWidth={3}
        />
      );
    }

    return (
      <Line
        key={stroke.id}
        points={stroke.points.flatMap(p => { const s = toStage(p.x, p.y); return [s.x, s.y]; })}
        stroke={stroke.isErasing ? 'rgba(0, 0, 0, 1)' : color}
        strokeWidth={stroke.brushSize * scaleX}
        lineCap="round" lineJoin="round"
        globalCompositeOperation={stroke.isErasing ? 'destination-out' : 'source-over'}
      />
    );
  };

  const renderCurrentStroke = () => {
    if (currentStroke.length === 0) return null;

    if (annotationMode === 'rectangle') {
      const s = toStage(currentStroke[0].x, currentStroke[0].y);
      const e = toStage(currentStroke[currentStroke.length - 1].x, currentStroke[currentStroke.length - 1].y);
      return (
        <Rect
          x={Math.min(s.x, e.x)} y={Math.min(s.y, e.y)}
          width={Math.abs(e.x - s.x)} height={Math.abs(e.y - s.y)}
          stroke="rgba(100, 200, 255, 0.8)" strokeWidth={3} dash={[5, 5]}
        />
      );
    }

    return (
      <Line
        points={currentStroke.flatMap(p => { const s = toStage(p.x, p.y); return [s.x, s.y]; })}
        stroke={isEraseMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 0, 0, 0.4)'}
        strokeWidth={brushSize * scaleX}
        lineCap="round" lineJoin="round"
      />
    );
  };

  if (displayWidth === 0 || displayHeight === 0) return null;

  return (
    <Stage
      ref={stageRef}
      width={displayWidth}
      height={displayHeight}
      style={{ display: 'block', cursor: 'crosshair', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <Layer>
        {strokes.map(renderStroke)}
        {renderCurrentStroke()}
      </Layer>
    </Stage>
  );
});

StrokeOverlay.displayName = 'StrokeOverlay';
