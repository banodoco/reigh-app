/**
 * Handles stroke rendering on canvas.
 * Draws strokes for both inpaint and annotate modes.
 */

import { useCallback, useEffect, useRef, useMemo } from 'react';
import type { BrushStroke, EditMode, ImageDimensions, CanvasSize } from './types';

interface UseStrokeRenderingProps {
  // Mode state
  isInpaintMode: boolean;
  editMode: EditMode;
  // Stroke data
  inpaintStrokes: BrushStroke[];
  annotationStrokes: BrushStroke[];
  selectedShapeId: string | null;
  // Dimensions
  imageDimensions: ImageDimensions | null;
  // Refs
  displayCanvasRef: React.RefObject<HTMLCanvasElement>;
  maskCanvasRef: React.RefObject<HTMLCanvasElement>;
}

interface UseStrokeRenderingReturn {
  redrawStrokes: (strokes: BrushStroke[]) => void;
  canvasSize: CanvasSize | null;
  imageToCanvas: (imageX: number, imageY: number) => { x: number; y: number };
}

export function useStrokeRendering({
  isInpaintMode,
  editMode,
  inpaintStrokes,
  annotationStrokes,
  selectedShapeId,
  imageDimensions,
  displayCanvasRef,
  maskCanvasRef,
}: UseStrokeRenderingProps): UseStrokeRenderingReturn {
  // Canvas size state
  const canvasSizeRef = useRef<CanvasSize | null>(null);

  // Throttling refs
  const lastRedrawTimeRef = useRef<number>(0);
  const pendingRedrawRef = useRef<NodeJS.Timeout | null>(null);
  const isMobileDevice = typeof navigator !== 'undefined' && /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

  // Computed: current brush strokes based on mode
  const brushStrokes = useMemo(() => {
    return editMode === 'annotate' ? annotationStrokes : editMode === 'inpaint' ? inpaintStrokes : [];
  }, [editMode, annotationStrokes, inpaintStrokes]);

  /**
   * Convert image pixel coordinates to canvas display coordinates
   */
  const imageToCanvas = useCallback((imageX: number, imageY: number): { x: number; y: number } => {
    const canvasSize = canvasSizeRef.current;
    if (!canvasSize || !imageDimensions) {
      return { x: imageX, y: imageY };
    }
    return {
      x: (imageX / imageDimensions.width) * canvasSize.width,
      y: (imageY / imageDimensions.height) * canvasSize.height
    };
  }, [imageDimensions]);

  /**
   * Draw scene (strokes only - image is rendered by <img> element)
   */
  const drawScene = useCallback(() => {
    const canvas = displayCanvasRef.current;
    const maskCanvas = maskCanvasRef.current;
    const canvasSize = canvasSizeRef.current;

    if (!canvas || !canvasSize || !imageDimensions) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.width / dpr;
    const cssHeight = canvas.height / dpr;

    // Reset transform and apply dpr scale
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Clear the entire canvas
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    // Get current strokes based on mode
    const currentStrokes = editMode === 'annotate' ? annotationStrokes : editMode === 'inpaint' ? inpaintStrokes : [];

    // Draw strokes
    if (currentStrokes.length > 0 && maskCanvas) {
      const maskCtx = maskCanvas.getContext('2d');
      if (maskCtx) {
        maskCtx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
        maskCtx.imageSmoothingEnabled = false;
      }

      currentStrokes.forEach((stroke) => {
        if (stroke.points.length < 2) return;

        const strokeBrushSize = stroke.brushSize || 20;
        const shapeType = stroke.shapeType || 'line';
        const isSelected = stroke.id === selectedShapeId;

        // Scale brush size from image coords to canvas coords
        const scaledBrushSize = (strokeBrushSize / imageDimensions.width) * canvasSize.width;

        // Set up context for display canvas
        ctx.globalCompositeOperation = stroke.isErasing ? 'destination-out' : 'source-over';

        if (isSelected && shapeType === 'rectangle') {
          ctx.strokeStyle = 'rgba(0, 255, 100, 0.9)';
        } else {
          ctx.strokeStyle = stroke.isErasing ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 0, 0, 0.4)';
        }

        ctx.lineWidth = shapeType === 'rectangle' ? 8 : scaledBrushSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Set up mask canvas context (in image coordinates)
        if (maskCtx) {
          maskCtx.globalCompositeOperation = stroke.isErasing ? 'destination-out' : 'source-over';
          maskCtx.strokeStyle = stroke.isErasing ? 'rgba(0, 0, 0, 1)' : 'rgba(255, 255, 255, 1)';
          maskCtx.fillStyle = stroke.isErasing ? 'rgba(0, 0, 0, 0.5)' : 'rgba(255, 255, 255, 0.5)';
          maskCtx.lineWidth = shapeType === 'rectangle' ? 8 : strokeBrushSize;
          maskCtx.lineCap = 'round';
          maskCtx.lineJoin = 'round';
        }

        // Convert points from image coords to canvas coords for display
        const canvasPoints = stroke.points.map(p => imageToCanvas(p.x, p.y));

        if (shapeType === 'rectangle') {
          if (stroke.isFreeForm && stroke.points.length === 4) {
            // Free-form quadrilateral
            ctx.beginPath();
            ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
            for (let i = 1; i < 4; i++) {
              ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
            }
            ctx.closePath();
            ctx.stroke();

            if (maskCtx) {
              maskCtx.beginPath();
              maskCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
              for (let i = 1; i < 4; i++) {
                maskCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
              }
              maskCtx.closePath();
              maskCtx.fill();
              maskCtx.stroke();
            }
          } else {
            // Standard rectangle
            const x = Math.min(canvasPoints[0].x, canvasPoints[1].x);
            const y = Math.min(canvasPoints[0].y, canvasPoints[1].y);
            const width = Math.abs(canvasPoints[1].x - canvasPoints[0].x);
            const height = Math.abs(canvasPoints[1].y - canvasPoints[0].y);

            ctx.strokeRect(x, y, width, height);

            if (maskCtx) {
              const mx = Math.min(stroke.points[0].x, stroke.points[1].x);
              const my = Math.min(stroke.points[0].y, stroke.points[1].y);
              const mw = Math.abs(stroke.points[1].x - stroke.points[0].x);
              const mh = Math.abs(stroke.points[1].y - stroke.points[0].y);
              maskCtx.fillRect(mx, my, mw, mh);
              maskCtx.strokeRect(mx, my, mw, mh);
            }
          }
        } else {
          // Line/freeform stroke
          ctx.beginPath();
          ctx.moveTo(canvasPoints[0].x, canvasPoints[0].y);
          for (let i = 1; i < canvasPoints.length; i++) {
            ctx.lineTo(canvasPoints[i].x, canvasPoints[i].y);
          }
          ctx.stroke();

          if (maskCtx) {
            maskCtx.beginPath();
            maskCtx.moveTo(stroke.points[0].x, stroke.points[0].y);
            for (let i = 1; i < stroke.points.length; i++) {
              maskCtx.lineTo(stroke.points[i].x, stroke.points[i].y);
            }
            maskCtx.stroke();
          }
        }
      });
    }

    // Reset composite operation
    ctx.globalCompositeOperation = 'source-over';
  }, [imageDimensions, editMode, annotationStrokes, inpaintStrokes, selectedShapeId, displayCanvasRef, maskCanvasRef, imageToCanvas]);

  /**
   * Redraw all strokes (with throttling for mobile)
   */
  const redrawStrokes = useCallback((strokes: BrushStroke[], immediate = false) => {
    // Throttle redraws
    if (!immediate) {
      const now = Date.now();
      const throttleMs = isMobileDevice ? 33 : 16;
      const timeSinceLastRedraw = now - lastRedrawTimeRef.current;

      if (timeSinceLastRedraw < throttleMs) {
        if (pendingRedrawRef.current) {
          clearTimeout(pendingRedrawRef.current);
        }
        pendingRedrawRef.current = setTimeout(() => {
          redrawStrokes(strokes, true);
        }, throttleMs - timeSinceLastRedraw);
        return;
      }
      lastRedrawTimeRef.current = now;
    }

    drawScene();
  }, [drawScene, isMobileDevice]);

  // Cleanup pending redraw timeout on unmount
  useEffect(() => {
    return () => {
      if (pendingRedrawRef.current) {
        clearTimeout(pendingRedrawRef.current);
        pendingRedrawRef.current = null;
      }
    };
  }, []);

  // Trigger redraw when relevant state changes
  useEffect(() => {
    if (isInpaintMode) {
      drawScene();
    }
  }, [isInpaintMode, brushStrokes, selectedShapeId, drawScene]);

  // Update canvas size when dimensions change
  useEffect(() => {
    if (!imageDimensions || !isInpaintMode || !displayCanvasRef.current) {
      return;
    }

    const canvas = displayCanvasRef.current;
    const canvasRect = canvas.getBoundingClientRect();
    const canvasWidth = Math.round(canvasRect.width);
    const canvasHeight = Math.round(canvasRect.height);

    if (canvasWidth === 0 || canvasHeight === 0) {
      return;
    }

    canvasSizeRef.current = { width: canvasWidth, height: canvasHeight };
  }, [imageDimensions, isInpaintMode, displayCanvasRef]);

  return {
    redrawStrokes,
    canvasSize: canvasSizeRef.current,
    imageToCanvas,
  };
}
