import { useState, useCallback, useRef } from 'react';
import type { ImageTransform } from './types';

interface UseRepositionDragProps {
  transform: ImageTransform;
  imageDimensions: { width: number; height: number } | null;
  imageContainerRef: React.RefObject<HTMLDivElement>;
  /** Callback to update transform when dragging */
  onTransformChange: (updates: Partial<ImageTransform>) => void;
}

interface UseRepositionDragReturn {
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
 * Hook for drag-to-move and scroll-to-zoom in reposition mode.
 *
 * Handles:
 * - Mouse/touch drag to pan (pointer events, capture for mouse only)
 * - Mouse wheel / trackpad pinch zoom (onWheel, caller wraps with passive:false)
 *
 * Touch pinch-to-zoom is NOT handled here — iOS Safari doesn't reliably dispatch
 * multi-touch pointer events. Pinch is handled via native touch event listeners
 * in MediaDisplayWithCanvas instead.
 */
export function useRepositionDrag({
  transform,
  imageDimensions,
  imageContainerRef,
  onTransformChange,
}: UseRepositionDragProps): UseRepositionDragReturn {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
    translateX: number;
    translateY: number;
    pointerType: string;
  } | null>(null);

  // Track number of active touch pointers to suppress drag during pinch
  const activeTouchCountRef = useRef(0);

  const handleDragPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === 'touch') {
      activeTouchCountRef.current++;
      // Two+ fingers down = pinch in progress, cancel any drag
      if (activeTouchCountRef.current >= 2) {
        if (isDragging) {
          setIsDragging(false);
          dragStartRef.current = null;
        }
        return;
      }
    }

    // Only primary button for mouse
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    // Capture for mouse only — touch capture breaks multi-touch on iOS Safari
    if (e.pointerType === 'mouse') {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }

    setIsDragging(true);
    dragStartRef.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      translateX: transform.translateX,
      translateY: transform.translateY,
      pointerType: e.pointerType,
    };

    e.preventDefault();
    e.stopPropagation();
  }, [transform.translateX, transform.translateY, isDragging]);

  const handleDragPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || !dragStartRef.current || !imageDimensions) return;
    // Only track the pointer that started the drag
    if (e.pointerId !== dragStartRef.current.pointerId) return;
    // Suppress drag if pinch is active
    if (e.pointerType === 'touch' && activeTouchCountRef.current >= 2) return;

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
    if (e.pointerType === 'touch') {
      activeTouchCountRef.current = Math.max(0, activeTouchCountRef.current - 1);
    }

    if (!isDragging) return;
    if (dragStartRef.current && e.pointerId !== dragStartRef.current.pointerId) return;

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
