import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isProcessingStatusFilter: vi.fn(),
  shouldForceProcessingRefetch: vi.fn(),
}));

vi.mock('@/shared/hooks/tasks/taskFetchPolicy', () => ({
  PROCESSING_REFETCH_POLICY: {
    maxConsecutiveStaleEmptyRefetches: 2,
  },
  isProcessingStatusFilter: mocks.isProcessingStatusFilter,
  shouldForceProcessingRefetch: mocks.shouldForceProcessingRefetch,
}));

import { useProcessingRefetchGuard } from './useProcessingRefetchGuard';

describe('useProcessingRefetchGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isProcessingStatusFilter.mockReturnValue(true);
    mocks.shouldForceProcessingRefetch.mockReturnValue(true);
  });

  it('forces refetch when policy requests it', () => {
    const refetch = vi.fn();
    const query = {
      data: { tasks: [{ id: 'task-1' }] },
      isFetching: false,
      status: 'success',
      dataUpdatedAt: 1,
      refetch,
    };

    renderHook(() => useProcessingRefetchGuard(['Processing'], query as never));

    expect(mocks.shouldForceProcessingRefetch).toHaveBeenCalledTimes(1);
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('stops forcing refetch after stale-empty retry limit is reached', () => {
    const refetch = vi.fn();
    const baseQuery = {
      data: { tasks: [] },
      isFetching: false,
      status: 'success',
      refetch,
    };

    const { rerender } = renderHook(
      ({ dataUpdatedAt }) =>
        useProcessingRefetchGuard(['Processing'], {
          ...baseQuery,
          dataUpdatedAt,
        } as never),
      {
        initialProps: { dataUpdatedAt: 1 },
      },
    );

    rerender({ dataUpdatedAt: 2 });
    rerender({ dataUpdatedAt: 3 });

    expect(refetch).toHaveBeenCalledTimes(2);
    expect(mocks.shouldForceProcessingRefetch).toHaveBeenCalledTimes(2);
  });
});
