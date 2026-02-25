import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useClickRipple } from '../useClickRipple';

describe('useClickRipple', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('returns initial inactive state', () => {
    const { result } = renderHook(() => useClickRipple());
    expect(result.current.isRippleActive).toBe(false);
    expect(result.current.rippleState.position).toEqual({ x: 0, y: 0 });
  });

  it('triggerRippleAtCenter sets position to center', () => {
    const { result } = renderHook(() => useClickRipple());
    act(() => {
      result.current.triggerRippleAtCenter();
    });
    expect(result.current.rippleState.isActive).toBe(true);
    expect(result.current.rippleState.position).toEqual({ x: 0, y: 0 });
  });

  it('deactivates ripple after duration', () => {
    const { result } = renderHook(() => useClickRipple({ duration: 500 }));
    act(() => {
      result.current.triggerRippleAtCenter();
    });
    expect(result.current.isRippleActive).toBe(true);
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.isRippleActive).toBe(false);
  });

  it('returns ripple styles with CSS custom properties', () => {
    const { result } = renderHook(() => useClickRipple());
    expect(result.current.rippleStyles).toEqual({
      '--ripple-x': '0px',
      '--ripple-y': '0px',
    });
  });

  it('triggerRipple calculates offset from center', () => {
    const { result } = renderHook(() => useClickRipple());

    const mockElement = {
      getBoundingClientRect: () => ({
        left: 0,
        top: 0,
        width: 100,
        height: 100,
      }),
    };

    const event = {
      stopPropagation: vi.fn(),
      currentTarget: mockElement,
      clientX: 75,
      clientY: 25,
    } as unknown as React.PointerEvent;

    act(() => {
      result.current.triggerRipple(event);
    });

    expect(event.stopPropagation).toHaveBeenCalled();
    // x offset = 75 - 50 = 25, y offset = 25 - 50 = -25
    expect(result.current.rippleState.position).toEqual({ x: 25, y: -25 });
  });
});
