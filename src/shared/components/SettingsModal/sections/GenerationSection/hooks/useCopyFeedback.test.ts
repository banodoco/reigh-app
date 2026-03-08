import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCopyFeedback } from './useCopyFeedback';

afterEach(() => {
  vi.useRealTimers();
});

describe('useCopyFeedback', () => {
  it('initializes all copied flags as false', () => {
    const { result } = renderHook(() => useCopyFeedback());

    expect(result.current.copiedInstallCommand).toBe(false);
    expect(result.current.copiedRunCommand).toBe(false);
    expect(result.current.copiedAIInstructions).toBe(false);
  });

  it('marks each copy state true then resets after 3 seconds', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useCopyFeedback());

    act(() => {
      result.current.markInstallCopied();
      result.current.markRunCopied();
      result.current.markAICopied();
    });

    expect(result.current.copiedInstallCommand).toBe(true);
    expect(result.current.copiedRunCommand).toBe(true);
    expect(result.current.copiedAIInstructions).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2999);
    });
    expect(result.current.copiedInstallCommand).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(result.current.copiedInstallCommand).toBe(false);
    expect(result.current.copiedRunCommand).toBe(false);
    expect(result.current.copiedAIInstructions).toBe(false);
  });
});
