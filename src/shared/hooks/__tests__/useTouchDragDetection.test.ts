import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTouchDragDetection } from '../useTouchDragDetection';

// Helper to create a TouchEvent-like object since jsdom doesn't support Touch constructor
function createTouchMoveEvent(clientX: number, clientY: number): Event {
  const event = new Event('touchmove', { bubbles: true });
  Object.defineProperty(event, 'touches', {
    value: [{ clientX, clientY }],
  });
  return event;
}

describe('useTouchDragDetection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns isDragging ref and handleTouchStart', () => {
    const { result } = renderHook(() => useTouchDragDetection());
    expect(result.current.isDragging).toHaveProperty('current', false);
    expect(typeof result.current.handleTouchStart).toBe('function');
  });

  it('sets isDragging to false on touch start', () => {
    const { result } = renderHook(() => useTouchDragDetection());
    const event = {
      touches: [{ clientX: 100, clientY: 100 }],
    } as unknown as React.TouchEvent;

    act(() => {
      result.current.handleTouchStart(event);
    });
    expect(result.current.isDragging.current).toBe(false);
  });

  it('detects drag when touch moves beyond threshold', () => {
    const { result } = renderHook(() => useTouchDragDetection(5));

    // Simulate touch start
    const startEvent = {
      touches: [{ clientX: 100, clientY: 100 }],
    } as unknown as React.TouchEvent;

    act(() => {
      result.current.handleTouchStart(startEvent);
    });

    // Simulate touch move beyond threshold
    act(() => {
      document.dispatchEvent(createTouchMoveEvent(110, 100));
    });

    expect(result.current.isDragging.current).toBe(true);
  });

  it('does not detect drag when touch moves within threshold', () => {
    const { result } = renderHook(() => useTouchDragDetection(10));

    const startEvent = {
      touches: [{ clientX: 100, clientY: 100 }],
    } as unknown as React.TouchEvent;

    act(() => {
      result.current.handleTouchStart(startEvent);
    });

    act(() => {
      document.dispatchEvent(createTouchMoveEvent(103, 102));
    });

    expect(result.current.isDragging.current).toBe(false);
  });

  it('resets isDragging after touch end with delay', () => {
    const { result } = renderHook(() => useTouchDragDetection(5));

    const startEvent = {
      touches: [{ clientX: 100, clientY: 100 }],
    } as unknown as React.TouchEvent;

    act(() => {
      result.current.handleTouchStart(startEvent);
    });

    // Move beyond threshold
    act(() => {
      document.dispatchEvent(createTouchMoveEvent(120, 100));
    });
    expect(result.current.isDragging.current).toBe(true);

    // Trigger touch end
    act(() => {
      document.dispatchEvent(new Event('touchend', { bubbles: true }));
    });

    // After 50ms delay, should reset
    act(() => {
      vi.advanceTimersByTime(50);
    });
    expect(result.current.isDragging.current).toBe(false);
  });
});
