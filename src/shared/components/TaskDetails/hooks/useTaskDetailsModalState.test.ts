// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTaskDetailsModalState } from './useTaskDetailsModalState';

const { mockNormalizeAndPresentError } = vi.hoisted(() => ({
  mockNormalizeAndPresentError: vi.fn(),
}));

vi.mock('../../../lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: mockNormalizeAndPresentError,
}));

describe('useTaskDetailsModalState', () => {
  let originalClipboard: Navigator['clipboard'];

  beforeEach(() => {
    originalClipboard = navigator.clipboard;
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    Object.assign(navigator, { clipboard: originalClipboard });
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('copies params and task ids with temporary feedback flags', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    const { result } = renderHook(() =>
      useTaskDetailsModalState({
        taskId: 'task-123',
        taskParams: { prompt: 'hello', frames: 16 },
      }),
    );

    await act(async () => {
      await result.current.handleCopyParams();
    });
    expect(writeText).toHaveBeenCalledWith('{\n  "prompt": "hello",\n  "frames": 16\n}');
    expect(result.current.paramsCopied).toBe(true);

    act(() => {
      result.current.handleCopyId();
    });
    expect(writeText).toHaveBeenLastCalledWith('task-123');
    expect(result.current.idCopied).toBe(true);

    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(result.current.paramsCopied).toBe(false);
    expect(result.current.idCopied).toBe(false);
  });

  it('reports copy failures without flipping the copied flag', async () => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockRejectedValue(new Error('permission denied')),
      },
    });

    const { result } = renderHook(() =>
      useTaskDetailsModalState({
        taskId: 'task-123',
        taskParams: { prompt: 'hello' },
      }),
    );

    await act(async () => {
      await result.current.handleCopyParams();
    });

    expect(result.current.paramsCopied).toBe(false);
    expect(mockNormalizeAndPresentError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'TaskDetailsModal',
        showToast: false,
      }),
    );
  });
});
