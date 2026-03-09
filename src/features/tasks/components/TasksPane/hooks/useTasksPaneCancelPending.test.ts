import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/types/tasks';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';
import { ITEMS_PER_PAGE, STATUS_GROUPS } from '../constants';
import { useTasksPaneCancelPending } from './useTasksPaneCancelPending';

const mocks = vi.hoisted(() => ({
  useQueryClient: vi.fn(),
  useCancelAllPendingTasks: vi.fn(),
  toast: vi.fn(),
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: (...args: unknown[]) => mocks.useQueryClient(...args),
}));

vi.mock('@/shared/hooks/tasks/useTaskCancellation', () => ({
  useCancelAllPendingTasks: (...args: unknown[]) => mocks.useCancelAllPendingTasks(...args),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

function makeTask(id: string, status: Task['status']): Task {
  return {
    id,
    status,
  } as unknown as Task;
}

describe('useTasksPaneCancelPending', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows an error toast when no project is selected', () => {
    const cancelAllIncoming = vi.fn();
    const mutation = { mutate: vi.fn(), isPending: false };
    const queryClient = {
      getQueryData: vi.fn(),
      setQueryData: vi.fn(),
      invalidateQueries: vi.fn(),
      refetchQueries: vi.fn(),
    };
    mocks.useQueryClient.mockReturnValue(queryClient);
    mocks.useCancelAllPendingTasks.mockReturnValue(mutation);

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

    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Error',
      description: 'No project selected.',
      variant: 'destructive',
    });
    expect(cancelAllIncoming).not.toHaveBeenCalled();
    expect(mutation.mutate).not.toHaveBeenCalled();
  });

  it('optimistically marks queued tasks cancelled and invalidates queries on success', () => {
    const selectedProjectId = 'project-1';
    const selectedFilter = 'Processing' as const;
    const currentPage = 1;
    const queryKey = [
      ...taskQueryKeys.paginated(selectedProjectId),
      STATUS_GROUPS[selectedFilter],
      ITEMS_PER_PAGE,
      (currentPage - 1) * ITEMS_PER_PAGE,
    ];
    const previousData = {
      tasks: [
        makeTask('task-1', 'Queued'),
        makeTask('task-2', 'In Progress'),
        makeTask('task-3', 'Queued'),
      ],
      total: 5,
      hasMore: false,
      totalPages: 1,
    };

    const queryDataStore = new Map<string, unknown>([[JSON.stringify(queryKey), previousData]]);
    const queryClient = {
      getQueryData: vi.fn((key: unknown[]) => queryDataStore.get(JSON.stringify(key))),
      setQueryData: vi.fn((key: unknown[], updater: unknown) => {
        const mapKey = JSON.stringify(key);
        const oldValue = queryDataStore.get(mapKey);
        const nextValue = typeof updater === 'function'
          ? (updater as (value: unknown) => unknown)(oldValue)
          : updater;
        queryDataStore.set(mapKey, nextValue);
      }),
      invalidateQueries: vi.fn(),
      refetchQueries: vi.fn(),
    };
    const cancelAllIncoming = vi.fn();
    const mutate = vi.fn((projectId: string, options: { onSuccess?: (data?: { cancelledCount?: number }) => void }) => {
      options.onSuccess?.({ cancelledCount: 2 });
    });
    mocks.useQueryClient.mockReturnValue(queryClient);
    mocks.useCancelAllPendingTasks.mockReturnValue({ mutate, isPending: true });

    const { result } = renderHook(() =>
      useTasksPaneCancelPending({
        selectedProjectId,
        selectedFilter,
        currentPage,
        cancelAllIncoming,
      }),
    );

    act(() => {
      result.current.handleCancelAllPending();
    });

    const updated = queryDataStore.get(JSON.stringify(queryKey)) as {
      tasks: Task[];
      total: number;
    };
    expect(updated.total).toBe(3);
    expect(updated.tasks.map((task) => task.status)).toEqual([
      'Cancelled',
      'In Progress',
      'Cancelled',
    ]);
    expect(cancelAllIncoming).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenCalledWith(selectedProjectId, expect.objectContaining({
      onSuccess: expect.any(Function),
      onError: expect.any(Function),
    }));
    expect(mocks.toast).toHaveBeenCalledWith({
      title: 'Tasks Cancellation Initiated',
      description: 'Cancelled 2 pending tasks.',
      variant: 'default',
    });
    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: taskQueryKeys.paginated(selectedProjectId),
    });
    expect(queryClient.refetchQueries).toHaveBeenCalledWith({
      queryKey: taskQueryKeys.paginated(selectedProjectId),
    });
    expect(result.current.isCancelAllPending).toBe(true);
  });

  it('rolls back optimistic updates and normalizes errors when cancellation fails', () => {
    const selectedProjectId = 'project-2';
    const selectedFilter = 'Processing' as const;
    const currentPage = 1;
    const queryKey = [
      ...taskQueryKeys.paginated(selectedProjectId),
      STATUS_GROUPS[selectedFilter],
      ITEMS_PER_PAGE,
      (currentPage - 1) * ITEMS_PER_PAGE,
    ];
    const previousData = {
      tasks: [makeTask('task-1', 'Queued')],
      total: 1,
      hasMore: false,
      totalPages: 1,
    };

    const queryDataStore = new Map<string, unknown>([[JSON.stringify(queryKey), previousData]]);
    const queryClient = {
      getQueryData: vi.fn((key: unknown[]) => queryDataStore.get(JSON.stringify(key))),
      setQueryData: vi.fn((key: unknown[], updater: unknown) => {
        const mapKey = JSON.stringify(key);
        const oldValue = queryDataStore.get(mapKey);
        const nextValue = typeof updater === 'function'
          ? (updater as (value: unknown) => unknown)(oldValue)
          : updater;
        queryDataStore.set(mapKey, nextValue);
      }),
      invalidateQueries: vi.fn(),
      refetchQueries: vi.fn(),
    };
    const error = new Error('cancel failed');
    const mutate = vi.fn((projectId: string, options: { onError?: (error: Error) => void }) => {
      options.onError?.(error);
    });
    mocks.useQueryClient.mockReturnValue(queryClient);
    mocks.useCancelAllPendingTasks.mockReturnValue({ mutate, isPending: false });

    const { result } = renderHook(() =>
      useTasksPaneCancelPending({
        selectedProjectId,
        selectedFilter,
        currentPage,
        cancelAllIncoming: vi.fn(),
      }),
    );

    act(() => {
      result.current.handleCancelAllPending();
    });

    const rolledBack = queryDataStore.get(JSON.stringify(queryKey));
    expect(rolledBack).toEqual(previousData);
    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(error, {
      context: 'TasksPane',
      toastTitle: 'Cancellation Failed',
    });
  });
});
