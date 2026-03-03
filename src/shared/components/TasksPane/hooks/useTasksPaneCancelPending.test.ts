import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTasksPaneCancelPending } from './useTasksPaneCancelPending';
import { useCancelAllPendingTasks } from '@/shared/hooks/tasks/useTaskCancellation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/toast';

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: vi.fn(),
}));

vi.mock('@/shared/hooks/tasks/useTaskCancellation', () => ({
  useCancelAllPendingTasks: vi.fn(),
}));

vi.mock('@/shared/components/ui/toast', () => ({
  toast: vi.fn(),
}));

describe('useTasksPaneCancelPending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useQueryClient).mockReturnValue({
      getQueryData: vi.fn(),
      setQueryData: vi.fn(),
      invalidateQueries: vi.fn(),
      refetchQueries: vi.fn(),
    } as never);
    vi.mocked(useCancelAllPendingTasks).mockReturnValue({
      mutate: vi.fn(),
      isPending: false,
    } as never);
  });

  it('shows a toast and exits when no project is selected', () => {
    const cancelAllIncoming = vi.fn();
    const { result } = renderHook(() =>
      useTasksPaneCancelPending({
        selectedProjectId: null,
        selectedFilter: 'Processing',
        currentPage: 1,
        cancelAllIncoming,
      }),
    );

    act(() => {
      result.current.handleCancelAllPending();
    });

    expect(vi.mocked(toast)).toHaveBeenCalledWith({
      title: 'Error',
      description: 'No project selected.',
      variant: 'destructive',
    });
    expect(cancelAllIncoming).not.toHaveBeenCalled();
    expect(result.current.isCancelAllPending).toBe(false);
  });
});
