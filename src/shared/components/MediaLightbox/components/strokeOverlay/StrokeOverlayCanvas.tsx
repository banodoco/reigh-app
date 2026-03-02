import React from 'react';
import { Stage, Layer, Line, Rect } from 'react-konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import type { BrushStroke } from '../../hooks/inpainting/types';

interface StrokeOverlayCanvasProps {
  displayWidth: number;
  displayHeight: number;
  strokes: BrushStroke[];
  currentStroke: Array<{ x: number; y: number }>;
  selectedShapeId: string | null;
  annotationMode: 'rectangle' | null;
  isEraseMode: boolean;
  brushSize: number;
  scaleX: number;
  toStage: (ix: number, iy: number) => { x: number; y: number };
  onPointerDown: (e: KonvaEventObject<PointerEvent>) => void;
  onPointerMove: (e: KonvaEventObject<PointerEvent>) => void;
  onPointerUp: (e: KonvaEventObject<PointerEvent>) => void;
}

function renderStroke({
  stroke,
  selectedShapeId,
  toStage,
  scaleX,
}: {
  stroke: BrushStroke;
  selectedShapeId: string | null;
  toStage: (ix: number, iy: number) => { x: number; y: number };
  scaleX: number;
}) {
  const isSelected = stroke.id === selectedShapeId;
  const color = isSelected
    ? 'rgba(0, 255, 100, 0.9)'
    : stroke.isErasing
      ? 'rgba(0, 0, 0, 0.5)'
      : 'rgba(255, 0, 0, 0.7)';

  if (stroke.shapeType === 'rectangle' && stroke.points.length >= 2) {
    if (stroke.isFreeForm && stroke.points.length === 4) {
      return (
        <Line
          key={stroke.id}
          points={stroke.points.flatMap((point) => {
            const stagePoint = toStage(point.x, point.y);
            return [stagePoint.x, stagePoint.y];
          })}
          stroke={color}
          strokeWidth={3}
          closed
        />
      );
    }

    const start = toStage(stroke.points[0].x, stroke.points[0].y);
    const end = toStage(stroke.points[1].x, stroke.points[1].y);
    return (
      <Rect
        key={stroke.id}
        x={Math.min(start.x, end.x)}
        y={Math.min(start.y, end.y)}
        width={Math.abs(end.x - start.x)}
        height={Math.abs(end.y - start.y)}
        stroke={color}
        strokeWidth={3}
      />
    );
  }

  return (
    <Line
      key={stroke.id}
      points={stroke.points.flatMap((point) => {
        const stagePoint = toStage(point.x, point.y);
        return [stagePoint.x, stagePoint.y];
      })}
      stroke={stroke.isErasing ? 'rgba(0, 0, 0, 1)' : color}
      strokeWidth={stroke.brushSize * scaleX}
      lineCap="round"
      lineJoin="round"
      globalCompositeOperation={stroke.isErasing ? 'destination-out' : 'source-over'}
    />
  );
}

function renderCurrentStroke({
  currentStroke,
  annotationMode,
  toStage,
  isEraseMode,
  brushSize,
  scaleX,
}: {
  currentStroke: Array<{ x: number; y: number }>;
  annotationMode: 'rectangle' | null;
  toStage: (ix: number, iy: number) => { x: number; y: number };
  isEraseMode: boolean;
  brushSize: number;
  scaleX: number;
}) {
  if (currentStroke.length === 0) {
    return null;
  }

  if (annotationMode === 'rectangle') {
    const start = toStage(currentStroke[0].x, currentStroke[0].y);
    const end = toStage(currentStroke[currentStroke.length - 1].x, currentStroke[currentStroke.length - 1].y);
    return (
      <Rect
        x={Math.min(start.x, end.x)}
        y={Math.min(start.y, end.y)}
        width={Math.abs(end.x - start.x)}
        height={Math.abs(end.y - start.y)}
        stroke="rgba(100, 200, 255, 0.8)"
        strokeWidth={3}
        dash={[5, 5]}
      />
    );
  }

  return (
    <Line
      points={currentStroke.flatMap((point) => {
        const stagePoint = toStage(point.x, point.y);
        return [stagePoint.x, stagePoint.y];
      })}
      stroke={isEraseMode ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 0, 0, 0.4)'}
      strokeWidth={brushSize * scaleX}
      lineCap="round"
      lineJoin="round"
    />
  );
}

export function StrokeOverlayCanvas({
  displayWidth,
  displayHeight,
  strokes,
  currentStroke,
  selectedShapeId,
  annotationMode,
  isEraseMode,
  brushSize,
  scaleX,
  toStage,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: StrokeOverlayCanvasProps) {
  if (displayWidth === 0 || displayHeight === 0) {
    return null;
  }

  return (
    <Stage
      width={displayWidth}
      height={displayHeight}
      style={{ display: 'block', cursor: 'crosshair', touchAction: 'none' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <Layer>
        {strokes.map((stroke) => renderStroke({
          stroke,
          selectedShapeId,
          toStage,
          scaleX,
        }))}
        {renderCurrentStroke({
          currentStroke,
          annotationMode,
          toStage,
          isEraseMode,
          brushSize,
          scaleX,
        })}
      </Layer>
    </Stage>
  );
}
