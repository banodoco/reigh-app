import { useState, useRef, useCallback, useEffect } from 'react';
import type { KonvaEventObject } from 'konva/lib/Node';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  isPointOnShape,
  getClickedCornerIndex,
  getRectangleClickType,
  getRectangleCorners,
} from '../../hooks/inpainting/shapeHelpers';
import type { BrushStroke } from '../../hooks/inpainting/types';

export interface StrokeOverlayDrawingProps {
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

interface StagePoint {
  x: number;
  y: number;
}

interface UseStrokeOverlayDrawingResult {
  handlePointerDown: (e: KonvaEventObject<PointerEvent>) => void;
  handlePointerMove: (e: KonvaEventObject<PointerEvent>) => void;
  handlePointerUp: (e: KonvaEventObject<PointerEvent>) => void;
  currentStroke: StagePoint[];
  selectedShapeId: string | null;
  updateSelection: (id: string | null) => void;
  scaleX: number;
  scaleY: number;
  toStage: (ix: number, iy: number) => StagePoint;
}

/** Clamped pointer position from a Konva event, in stage coordinates. */
function getClampedPos(
  e: KonvaEventObject<PointerEvent>,
  w: number,
  h: number,
): StagePoint | null {
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

export function useStrokeOverlayDrawing({
  displayWidth,
  displayHeight,
  imageWidth,
  imageHeight,
  strokes,
  isEraseMode,
  brushSize,
  annotationMode,
  isInpaintMode,
  isAnnotateMode,
  editMode,
  onStrokeComplete,
  onStrokesChange,
  onSelectionChange,
  onTextModeHint,
}: StrokeOverlayDrawingProps): UseStrokeOverlayDrawingResult {
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentStroke, setCurrentStroke] = useState<StagePoint[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);

  // Refs mirror state for synchronous reads inside pointer handlers,
  // where React's async state updates would give stale values.
  const isDrawingRef = useRef(false);
  const currentStrokeRef = useRef<StagePoint[]>([]);

  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<StagePoint | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>('resize');
  const [draggingCornerIndex, setDraggingCornerIndex] = useState<number | null>(null);
  const draggedShapeRef = useRef<BrushStroke | null>(null);

  const lastClickTimeRef = useRef(0);
  const lastClickPosRef = useRef<StagePoint | null>(null);

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
      if (clickType === 'edge') {
        startDrag(stroke, 'move', x, y);
        return true;
      }
      if (clickType === 'corner' && !stroke.isFreeForm) {
        startDrag(stroke, 'resize', x, y);
        return true;
      }
      return true; // middle — just selected, no drag
    }
    return false;
  }, [strokes, onStrokesChange, updateSelection, startDrag]);

  const handlePointerDown = useCallback((e: KonvaEventObject<PointerEvent>) => {
    const pos = getClampedPos(e, displayWidth, displayHeight);
    if (!pos) return;

    const stage = e.target.getStage();
    if (stage?.content && e.evt.pointerId !== undefined) {
      try {
        stage.content.setPointerCapture(e.evt.pointerId);
      } catch (error) {
        normalizeAndPresentError(error, {
          context: 'StrokeOverlay.handlePointerDown.setPointerCapture',
          showToast: false,
          logData: { pointerId: e.evt.pointerId },
        });
      }
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
  }, [
    displayWidth,
    displayHeight,
    isInpaintMode,
    isAnnotateMode,
    annotationMode,
    selectedShapeId,
    editMode,
    onTextModeHint,
    toImage,
    hitTestShapes,
    updateSelection,
  ]);

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
        updated = {
          ...shape,
          points: shape.points.map(p => ({ x: p.x + dx, y: p.y + dy })),
          isFreeForm: shape.isFreeForm,
        };
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
  }, [
    isInpaintMode,
    isAnnotateMode,
    editMode,
    isDragging,
    dragMode,
    dragOffset,
    draggingCornerIndex,
    strokes,
    displayWidth,
    displayHeight,
    onStrokesChange,
    toImage,
  ]);

  const handlePointerUp = useCallback((e: KonvaEventObject<PointerEvent>) => {
    const stage = e.target.getStage();
    if (stage?.content && e.evt.pointerId !== undefined) {
      try {
        stage.content.releasePointerCapture(e.evt.pointerId);
      } catch (error) {
        normalizeAndPresentError(error, {
          context: 'StrokeOverlay.handlePointerUp.releasePointerCapture',
          showToast: false,
          logData: { pointerId: e.evt.pointerId },
        });
      }
    }

    if (isDragging) {
      endDrag();
      return;
    }

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
        id: crypto.randomUUID(),
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
  }, [
    isInpaintMode,
    isAnnotateMode,
    isEraseMode,
    brushSize,
    annotationMode,
    isDragging,
    editMode,
    endDrag,
    onStrokeComplete,
    updateSelection,
  ]);

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
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    currentStroke,
    selectedShapeId,
    updateSelection,
    scaleX,
    scaleY,
    toStage,
  };
}
