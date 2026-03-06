import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';

interface UseRepositionGestureHandlersProps {
  isInpaintMode: boolean;
  editMode: string;
  repositionDragHandlers?: {
    onWheel?: (event: React.WheelEvent) => void;
  };
  onRepositionScaleChange?: (value: number) => void;
  onRepositionRotationChange?: (value: number) => void;
  repositionScale: number;
  repositionRotation: number;
  imageRef: React.RefObject<HTMLImageElement>;
  imageWrapperRef: React.RefObject<HTMLDivElement>;
}

export function useRepositionGestureHandlers({
  isInpaintMode,
  editMode,
  repositionDragHandlers,
  onRepositionScaleChange,
  onRepositionRotationChange,
  repositionScale,
  repositionRotation,
  imageRef,
  imageWrapperRef,
}: UseRepositionGestureHandlersProps) {
  // Corner rotation drag state
  const rotationDragRef = useRef<{ startAngle: number; startRotation: number } | null>(null);

  const handleCornerRotateStart = useCallback((e: React.PointerEvent) => {
    if (!onRepositionRotationChange) return;
    e.preventDefault();
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const wrapper = imageWrapperRef.current;
    const img = imageRef.current;
    if (!wrapper || !img) return;

    const rect = img.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const angle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);

    rotationDragRef.current = { startAngle: angle, startRotation: repositionRotation };
  }, [imageRef, imageWrapperRef, onRepositionRotationChange, repositionRotation]);

  const handleCornerRotateMove = useCallback((e: React.PointerEvent) => {
    if (!rotationDragRef.current || !onRepositionRotationChange) return;

    const img = imageRef.current;
    if (!img) return;

    const rect = img.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx) * (180 / Math.PI);
    const deltaAngle = currentAngle - rotationDragRef.current.startAngle;

    let newRotation = rotationDragRef.current.startRotation + deltaAngle;
    if (newRotation > 180) newRotation -= 360;
    if (newRotation < -180) newRotation += 360;

    onRepositionRotationChange(Math.round(newRotation));
  }, [imageRef, onRepositionRotationChange]);

  const handleCornerRotateEnd = useCallback((e: React.PointerEvent) => {
    if (!rotationDragRef.current) return;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // already released
    }
    rotationDragRef.current = null;
  }, []);

  const dragContainerRef = useRef<HTMLDivElement>(null);
  const handlesOverlayRef = useRef<HTMLDivElement>(null);

  // Keep latest values in refs so touch listeners don't re-attach on every small change.
  const scaleRef = useRef(repositionScale);
  scaleRef.current = repositionScale;
  const rotationRef = useRef(repositionRotation);
  rotationRef.current = repositionRotation;

  useEffect(() => {
    const el = dragContainerRef.current;
    if (!isInpaintMode || editMode !== 'reposition' || !el) return;

    const cleanups: Array<() => void> = [];

    const wheelHandler = repositionDragHandlers?.onWheel;
    if (wheelHandler) {
      const nativeWheelHandler = (e: WheelEvent) => {
        e.preventDefault();
        wheelHandler(e as unknown as React.WheelEvent);
      };
      el.addEventListener('wheel', nativeWheelHandler, { passive: false });
      cleanups.push(() => el.removeEventListener('wheel', nativeWheelHandler));
    }

    if (onRepositionScaleChange || onRepositionRotationChange) {
      let gestureStartDistance = 0;
      let gestureStartAngle = 0;
      let gestureStartScale = 1;
      let gestureStartRotation = 0;
      let gestureStartTransform = '';
      let lastScale = 0;
      let lastRotation = 0;
      let gestureActive = false;

      const getTouchVector = (e: TouchEvent) => ({
        dx: e.touches[1].clientX - e.touches[0].clientX,
        dy: e.touches[1].clientY - e.touches[0].clientY,
      });

      const buildTransform = (newScale: number, newRotation: number): string => {
        let result = gestureStartTransform;
        result = result.replace(
          /scale\((-?)[\d.]+,\s*(-?)[\d.]+\)/,
          `scale($1${newScale}, $2${newScale})`,
        );
        result = result.replace(
          /rotate\(-?[\d.]+deg\)/,
          `rotate(${newRotation}deg)`,
        );
        return result;
      };

      const handleTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 2) {
          const { dx, dy } = getTouchVector(e);
          gestureStartDistance = Math.hypot(dx, dy);
          gestureStartAngle = Math.atan2(dy, dx) * (180 / Math.PI);
          gestureStartScale = scaleRef.current;
          gestureStartRotation = rotationRef.current;
          lastScale = gestureStartScale;
          lastRotation = gestureStartRotation;
          gestureActive = true;
          const img = imageRef.current;
          if (img) gestureStartTransform = img.style.transform;
        }
      };

      const handleTouchMove = (e: TouchEvent) => {
        if (e.touches.length >= 2) {
          e.preventDefault();
        }
        if (e.touches.length === 2 && gestureActive) {
          const { dx, dy } = getTouchVector(e);
          const distance = Math.hypot(dx, dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);

          const ratio = distance / gestureStartDistance;
          const newScale = Math.max(0.25, Math.min(2.0, gestureStartScale * ratio));
          lastScale = newScale;

          const angleDelta = angle - gestureStartAngle;
          const newRotation = gestureStartRotation + angleDelta;
          lastRotation = newRotation;

          const newTransform = buildTransform(newScale, newRotation);
          const img = imageRef.current;
          if (img) img.style.transform = newTransform;
          const handles = handlesOverlayRef.current;
          if (handles) handles.style.transform = newTransform;
        }
      };

      const handleTouchEnd = (e: TouchEvent) => {
        if (e.touches.length < 2 && gestureActive) {
          gestureActive = false;
          if (onRepositionScaleChange && lastScale !== gestureStartScale) {
            onRepositionScaleChange(lastScale);
          }
          if (onRepositionRotationChange && lastRotation !== gestureStartRotation) {
            onRepositionRotationChange(Math.round(lastRotation));
          }
        }
      };

      el.addEventListener('touchstart', handleTouchStart, { passive: true });
      el.addEventListener('touchmove', handleTouchMove, { passive: false });
      el.addEventListener('touchend', handleTouchEnd);
      el.addEventListener('touchcancel', handleTouchEnd);
      cleanups.push(() => {
        el.removeEventListener('touchstart', handleTouchStart);
        el.removeEventListener('touchmove', handleTouchMove);
        el.removeEventListener('touchend', handleTouchEnd);
        el.removeEventListener('touchcancel', handleTouchEnd);
      });
    }

    return () => cleanups.forEach((fn) => fn());
  }, [
    editMode,
    imageRef,
    isInpaintMode,
    onRepositionRotationChange,
    onRepositionScaleChange,
    repositionDragHandlers,
  ]);

  return {
    dragContainerRef,
    handlesOverlayRef,
    handleCornerRotateStart,
    handleCornerRotateMove,
    handleCornerRotateEnd,
  };
}
