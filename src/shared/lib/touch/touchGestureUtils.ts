import type React from 'react';
import type { MutableRefObject } from 'react';

interface TouchPoint {
  x: number;
  y: number;
}

export function captureTouchStartPoint(
  ref: MutableRefObject<TouchPoint | null>,
  event: React.TouchEvent,
): void {
  const touch = event.touches[0];
  ref.current = { x: touch.clientX, y: touch.clientY };
}

export function isTouchTapWithinThreshold(
  ref: MutableRefObject<TouchPoint | null>,
  event: React.TouchEvent,
  threshold: number,
): boolean {
  if (!ref.current) {
    return false;
  }

  const touch = event.changedTouches[0];
  const deltaX = Math.abs(touch.clientX - ref.current.x);
  const deltaY = Math.abs(touch.clientY - ref.current.y);
  ref.current = null;

  return deltaX <= threshold && deltaY <= threshold;
}
