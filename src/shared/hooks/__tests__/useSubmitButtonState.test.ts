import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSubmitButtonState } from '../useSubmitButtonState';

describe('useSubmitButtonState', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useSubmitButtonState());

    expect(result.current.state).toBe('idle');
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.isSuccess).toBe(false);
  });

  it('transitions to submitting on trigger', () => {
    const { result } = renderHook(() => useSubmitButtonState());

    act(() => {
      result.current.trigger();
    });

    expect(result.current.state).toBe('submitting');
    expect(result.current.isSubmitting).toBe(true);
    expect(result.current.isSuccess).toBe(false);
  });

  it('transitions to success after submitting duration', () => {
    const { result } = renderHook(() => useSubmitButtonState());

    act(() => {
      result.current.trigger();
    });

    act(() => {
      vi.advanceTimersByTime(1000); // Default submittingDuration
    });

    expect(result.current.state).toBe('success');
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.isSuccess).toBe(true);
  });

  it('transitions back to idle after success duration', () => {
    const { result } = renderHook(() => useSubmitButtonState());

    act(() => {
      result.current.trigger();
    });

    act(() => {
      vi.advanceTimersByTime(1000); // submitting -> success
    });

    act(() => {
      vi.advanceTimersByTime(2000); // success -> idle
    });

    expect(result.current.state).toBe('idle');
    expect(result.current.isSubmitting).toBe(false);
    expect(result.current.isSuccess).toBe(false);
  });

  it('respects custom durations', () => {
    const { result } = renderHook(() =>
      useSubmitButtonState({ submittingDuration: 500, successDuration: 1000 })
    );

    act(() => {
      result.current.trigger();
    });

    // Still submitting at 499ms
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current.state).toBe('submitting');

    // Success at 500ms
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.state).toBe('success');

    // Still success at 999ms after entering success
    act(() => {
      vi.advanceTimersByTime(999);
    });
    expect(result.current.state).toBe('success');

    // Back to idle at 1000ms after entering success
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.state).toBe('idle');
  });

  it('reset returns to idle immediately', () => {
    const { result } = renderHook(() => useSubmitButtonState());

    act(() => {
      result.current.trigger();
    });

    expect(result.current.state).toBe('submitting');

    act(() => {
      result.current.reset();
    });

    expect(result.current.state).toBe('idle');
  });

  it('reset clears pending timeouts', () => {
    const { result } = renderHook(() => useSubmitButtonState());

    act(() => {
      result.current.trigger();
    });

    act(() => {
      result.current.reset();
    });

    // Advancing past when success should have triggered
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Should still be idle, not transitioned to success
    expect(result.current.state).toBe('idle');
  });

  it('re-trigger clears existing transition and starts fresh', () => {
    const { result } = renderHook(() =>
      useSubmitButtonState({ submittingDuration: 1000, successDuration: 2000 })
    );

    act(() => {
      result.current.trigger();
    });

    // Advance partway through submitting
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Re-trigger
    act(() => {
      result.current.trigger();
    });

    expect(result.current.state).toBe('submitting');

    // Original timer would have fired at 500ms more, but re-trigger resets
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Still submitting because the new timer runs for 1000ms from re-trigger
    expect(result.current.state).toBe('submitting');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.state).toBe('success');
  });
});
