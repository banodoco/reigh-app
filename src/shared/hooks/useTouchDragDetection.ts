import { useRef, useEffect, useCallback } from 'react';

/**
 * Detects whether a touch interaction is a drag vs a tap.
 * Returns a touch start handler and a ref indicating if the user is dragging.
 */
export function useTouchDragDetection(dragThreshold = 5) {
  const dragStartPos = useRef<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);

  useEffect(() => {
    const handleGlobalTouchMove = (e: TouchEvent) => {
      if (dragStartPos.current && e.touches.length > 0) {
        const touch = e.touches[0];
        const deltaX = Math.abs(touch.clientX - dragStartPos.current.x);
        const deltaY = Math.abs(touch.clientY - dragStartPos.current.y);
        if (deltaX > dragThreshold || deltaY > dragThreshold) {
          isDragging.current = true;
        }
      }
    };

    const handleGlobalTouchEnd = () => {
      setTimeout(() => {
        dragStartPos.current = null;
        isDragging.current = false;
      }, 50);
    };

    document.addEventListener('touchmove', handleGlobalTouchMove, { passive: true });
    document.addEventListener('touchend', handleGlobalTouchEnd);
    return () => {
      document.removeEventListener('touchmove', handleGlobalTouchMove);
      document.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [dragThreshold]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      dragStartPos.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
      isDragging.current = false;
    }
  }, []);

  return { isDragging, handleTouchStart };
}
