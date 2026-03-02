import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { usePaneInteractionLifecycle } from './usePaneInteractionLifecycle';

describe('usePaneInteractionLifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('enables pointer events after open transition and disables interactions while opening', () => {
    const onOpenStart = vi.fn();
    const onClose = vi.fn();

    const { result, rerender } = renderHook(
      ({ isOpen }) =>
        usePaneInteractionLifecycle({
          isOpen,
          transitionMs: 200,
          disableInteractionsDuringOpen: true,
          onOpenStart,
          onClose,
        }),
      { initialProps: { isOpen: false } },
    );

    expect(result.current).toEqual({
      isPointerEventsEnabled: false,
      isInteractionDisabled: false,
    });

    rerender({ isOpen: true });
    expect(onOpenStart).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({
      isPointerEventsEnabled: false,
      isInteractionDisabled: true,
    });

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toEqual({
      isPointerEventsEnabled: true,
      isInteractionDisabled: false,
    });

    rerender({ isOpen: false });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(result.current).toEqual({
      isPointerEventsEnabled: false,
      isInteractionDisabled: false,
    });
  });
});
