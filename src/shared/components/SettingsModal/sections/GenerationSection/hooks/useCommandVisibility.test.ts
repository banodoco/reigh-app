import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCommandVisibility } from './useCommandVisibility';

afterEach(() => {
  vi.useRealTimers();
});

describe('useCommandVisibility', () => {
  it('starts collapsed and allows prerequisite visibility updates', () => {
    const { result } = renderHook(() => useCommandVisibility());

    expect(result.current.showFullInstallCommand).toBe(false);
    expect(result.current.showFullRunCommand).toBe(false);
    expect(result.current.showPrerequisites).toBe(false);

    act(() => {
      result.current.setShowPrerequisites(true);
    });

    expect(result.current.showPrerequisites).toBe(true);
  });

  it('reveals install command and scrolls install preview into view', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCommandVisibility());

    const scrollIntoView = vi.fn();
    (result.current.installCommandRef as { current: { scrollIntoView: () => void } | null }).current = {
      scrollIntoView,
    };

    act(() => {
      result.current.revealInstallCommand();
    });

    expect(result.current.showFullInstallCommand).toBe(true);
    expect(scrollIntoView).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('reveals run command and scrolls run preview into view', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCommandVisibility());

    const scrollIntoView = vi.fn();
    (result.current.runCommandRef as { current: { scrollIntoView: () => void } | null }).current = {
      scrollIntoView,
    };

    act(() => {
      result.current.revealRunCommand();
    });

    expect(result.current.showFullRunCommand).toBe(true);

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });
});
