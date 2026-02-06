import { useState, useCallback, useRef } from 'react';
import type { ImageTransform } from './types';

export interface UseRepositionDragProps {
  transform: ImageTransform;
  imageDimensions: { width: number; height: number } | null;
  imageContainerRef: React.RefObject<HTMLDivElement>;
  /** Callback to update transform when dragging */
  onTransformChange: (updates: Partial<ImageTransform>) => void;
}

export interface UseRepositionDragReturn {
  isDragging: boolean;
  dragHandlers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    onWheel: (e: React.WheelEvent) => void;
  };
}

const MIN_SCALE = 0.25;
const MAX_SCALE = 2.0;
const WHEEL_ZOOM_SPEED = 0.002;
const PINCH_ZOOM_SPEED = 0.01;

/**
 * Hook for drag-to-move and scroll/pinch-to-zoom in reposition mode.
 *
 * Input methods:
 * - Mouse drag: pointer capture for reliable tracking outside element
 * - Touch drag: single finger, no pointer capture (touch-action:none handles it)
 * - Mouse wheel: onWheel handler (caller wraps in native listener with passive:false)
 * - Trackpad pinch: same as wheel but with ctrlKey and finer speed
 * - Touch pinch: two-pointer tracking via pointer events (no capture needed)
 *
 * Key: we only use setPointerCapture for mouse. On touch, capturing the first
 * pointer prevents the second pointer's events from dispatching correctly on
 * iOS Safari, breaking pinch-to-zoom.
 */
export function useRepositionDrag({
  transform,
  imageDimensions,
  imageContainerRef,
  onTransformChange,
}: UseRepositionDragProps): UseRepositionDragReturn {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    translateX: number;
    translateY: number;
  } | null>(null);

  // Track active pointers for pinch-to-zoom
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{ distance: number; scale: number } | null>(null);

  // --- Drag-to-move / pinch-to-zoom ---

  const handleDragPointerDown = useCallback((e: React.PointerEvent) => {
    // Track all pointers for pinch detection
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Two pointers = start pinch, cancel any active drag
    if (activePointersRef.current.size === 2) {
      // Release any mouse pointer capture from a prior drag
      if (dragStartRef.current) {
        try { (e.target as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
      }
      setIsDragging(false);
      dragStartRef.current = null;

      const points = Array.from(activePointersRef.current.values());
      const distance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      pinchStartRef.current = { distance, scale: transform.scale };

      e.preventDefault();
      e.stopPropagation();
      return;
    }

    // Single pointer: start drag (only primary button for mouse)
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // Only capture for mouse — touch capture breaks multi-touch on iOS Safari
    if (e.pointerType === 'mouse') {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }

    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      translateX: transform.translateX,
      translateY: transform.translateY,
    };

    e.preventDefault();
    e.stopPropagation();
  }, [transform.translateX, transform.translateY, transform.scale]);

  const handleDragPointerMove = useCallback((e: React.PointerEvent) => {
    // Update tracked pointer position
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    // Pinch-to-zoom: two active pointers
    if (activePointersRef.current.size === 2 && pinchStartRef.current) {
      const points = Array.from(activePointersRef.current.values());
      const currentDistance = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
      const ratio = currentDistance / pinchStartRef.current.distance;
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStartRef.current.scale * ratio));

      onTransformChange({ scale: newScale });
      return;
    }

    // Single pointer drag
    if (!isDragging || !dragStartRef.current || !imageDimensions) return;

    const deltaX = e.clientX - dragStartRef.current.x;
    const deltaY = e.clientY - dragStartRef.current.y;

    const containerEl = imageContainerRef.current;
    if (!containerEl) return;

    const imgEl = containerEl.querySelector('img');
    const displayedWidth = imgEl?.clientWidth || imageDimensions.width;
    const displayedHeight = imgEl?.clientHeight || imageDimensions.height;

    const effectiveScale = transform.scale || 1;
    const deltaXPercent = (deltaX / displayedWidth) * 100 / effectiveScale;
    const deltaYPercent = (deltaY / displayedHeight) * 100 / effectiveScale;

    const maxTranslate = 100;
    const newTranslateX = Math.max(
      -maxTranslate,
      Math.min(maxTranslate, dragStartRef.current.translateX + deltaXPercent)
    );
    const newTranslateY = Math.max(
      -maxTranslate,
      Math.min(maxTranslate, dragStartRef.current.translateY + deltaYPercent)
    );

    onTransformChange({
      translateX: newTranslateX,
      translateY: newTranslateY,
    });
  }, [isDragging, imageDimensions, imageContainerRef, transform.scale, onTransformChange]);

  const handleDragPointerUp = useCallback((e: React.PointerEvent) => {
    activePointersRef.current.delete(e.pointerId);

    // If we were pinching and one finger lifts, clear pinch state
    if (pinchStartRef.current) {
      pinchStartRef.current = null;
    }

    if (!isDragging) return;

    // Release capture (only set for mouse, but safe to call regardless)
    if (e.pointerType === 'mouse') {
      try {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      } catch {
        // Pointer capture may already be released
      }
    }

    setIsDragging(false);
    dragStartRef.current = null;
  }, [isDragging]);

  const handleDragPointerCancel = useCallback((e: React.PointerEvent) => {
    handleDragPointerUp(e);
  }, [handleDragPointerUp]);

  // --- Scroll/trackpad zoom ---

  const handleWheel = useCallback((e: React.WheelEvent) => {
    // ctrlKey is set for trackpad pinch gestures; use finer speed
    const speed = e.ctrlKey ? PINCH_ZOOM_SPEED : WHEEL_ZOOM_SPEED;
    const delta = -e.deltaY * speed;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, transform.scale + delta));

    onTransformChange({ scale: newScale });
  }, [transform.scale, onTransformChange]);

  return {
    isDragging,
    dragHandlers: {
      onPointerDown: handleDragPointerDown,
      onPointerMove: handleDragPointerMove,
      onPointerUp: handleDragPointerUp,
      onPointerCancel: handleDragPointerCancel,
      onWheel: handleWheel,
    },
  };
}
