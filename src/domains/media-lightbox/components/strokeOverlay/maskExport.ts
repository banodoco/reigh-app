import Konva from 'konva';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { BrushStroke } from '../../hooks/inpainting/types';

interface ExportStrokeMaskInput {
  strokes: BrushStroke[];
  imageWidth: number;
  imageHeight: number;
  pixelRatio?: number;
}

const DEFAULT_EXPORT_PIXEL_RATIO = 1.5;
const MASK_BACKGROUND = 'black';
const MASK_STROKE = 'white';
const RECTANGLE_MASK_STROKE_WIDTH = 6;

function addStrokeToMaskLayer(layer: Konva.Layer, stroke: BrushStroke): void {
  if (stroke.points.length < 2) {
    return;
  }

  if (stroke.shapeType === 'rectangle') {
    if (stroke.isFreeForm && stroke.points.length === 4) {
      layer.add(new Konva.Line({
        points: stroke.points.flatMap(point => [point.x, point.y]),
        stroke: MASK_STROKE,
        strokeWidth: RECTANGLE_MASK_STROKE_WIDTH,
        closed: true,
        lineCap: 'round',
        lineJoin: 'round',
      }));
      return;
    }

    const start = stroke.points[0];
    const end = stroke.points[1];
    layer.add(new Konva.Rect({
      x: Math.min(start.x, end.x),
      y: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y),
      stroke: MASK_STROKE,
      strokeWidth: RECTANGLE_MASK_STROKE_WIDTH,
    }));
    return;
  }

  layer.add(new Konva.Line({
    points: stroke.points.flatMap(point => [point.x, point.y]),
    stroke: MASK_STROKE,
    strokeWidth: stroke.brushSize,
    lineCap: 'round',
    lineJoin: 'round',
  }));
}

export function exportStrokeMask({
  strokes,
  imageWidth,
  imageHeight,
  pixelRatio = DEFAULT_EXPORT_PIXEL_RATIO,
}: ExportStrokeMaskInput): string | null {
  if (strokes.length === 0) {
    return null;
  }

  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  document.body.appendChild(container);

  try {
    const stage = new Konva.Stage({
      container,
      width: imageWidth,
      height: imageHeight,
    });
    const layer = new Konva.Layer();
    stage.add(layer);

    layer.add(new Konva.Rect({
      x: 0,
      y: 0,
      width: imageWidth,
      height: imageHeight,
      fill: MASK_BACKGROUND,
    }));

    strokes.forEach((stroke) => addStrokeToMaskLayer(layer, stroke));

    layer.draw();
    const dataUrl = stage.toDataURL({
      pixelRatio,
      mimeType: 'image/png',
    });
    stage.destroy();
    return dataUrl;
  } catch (error) {
    normalizeAndPresentError(error, {
      context: 'StrokeOverlay.exportMask',
      showToast: false,
    });
    return null;
  } finally {
    document.body.removeChild(container);
  }
}
