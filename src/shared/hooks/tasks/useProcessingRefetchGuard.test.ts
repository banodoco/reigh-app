import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TASK_STATUS } from '@/types/tasks';
import { PROCESSING_REFETCH_POLICY } from './taskFetchPolicy';
import { useProcessingRefetchGuard } from './useProcessingRefetchGuard';

describe('useProcessingRefetchGuard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refetches stale empty processing results that are past the backoff window', () => {
    vi.spyOn(Date, 'now').mockReturnValue(100_000);
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });

    const refetch = vi.fn();

    renderHook(() =>
      useProcessingRefetchGuard(
        [TASK_STATUS.QUEUED, TASK_STATUS.IN_PROGRESS],
        {
          data: { tasks: [] },
          isFetching: false,
          status: 'success',
          dataUpdatedAt: 60_000,
          refetch,
        },
      ),
    );

    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('stops forcing refetches after the stale-empty attempt budget is exhausted', () => {
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(100_000);
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false,
    });

    const refetch = vi.fn();
    const { rerender } = renderHook(
      ({ dataUpdatedAt }) =>
        useProcessingRefetchGuard(
          [TASK_STATUS.QUEUED, TASK_STATUS.IN_PROGRESS],
          {
            data: { tasks: [] },
            isFetching: false,
            status: 'success',
            dataUpdatedAt,
            refetch,
          },
        ),
      {
        initialProps: { dataUpdatedAt: 60_000 },
      },
    );

    for (let attempt = 0; attempt < PROCESSING_REFETCH_POLICY.maxConsecutiveStaleEmptyRefetches + 1; attempt += 1) {
      nowSpy.mockReturnValue(
        100_000 + ((PROCESSING_REFETCH_POLICY.foregroundMinBackoffMs + 1) * (attempt + 1)),
      );
      rerender({ dataUpdatedAt: 60_000 + attempt });
    }

    expect(refetch).toHaveBeenCalledTimes(
      PROCESSING_REFETCH_POLICY.maxConsecutiveStaleEmptyRefetches,
    );
  });
});
