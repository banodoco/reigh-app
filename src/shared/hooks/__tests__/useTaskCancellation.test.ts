import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { mockFrom, mockHandleError } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockHandleError: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mockFrom,
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: mockHandleError,
}));

vi.mock('@/shared/lib/queryKeys/tasks', () => ({
  taskQueryKeys: {
    paginatedAll: ['tasks', 'paginated'],
    statusCountsAll: ['task-status-counts'],
  },
}));

import { useCancelTask, useCancelAllPendingTasks } from '../useTaskCancellation';

type MockChain = Record<string, ReturnType<typeof vi.fn>>;

function createQueryClient() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return client;
}

function createTaskCancellationWrapper(queryClient: QueryClient) {
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return wrapper;
}

describe('useCancelTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels a queued task and invalidates relevant queries', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const fetchTaskChain = {
      select: vi.fn(),
      eq: vi.fn(),
      update: vi.fn(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'task-1',
          status: 'Queued',
          task_type: 'image-generation',
          project_id: 'proj-1',
        },
        error: null,
      }),
    } as MockChain;
    fetchTaskChain.select.mockReturnValue(fetchTaskChain);
    fetchTaskChain.eq.mockReturnValue(fetchTaskChain);
    fetchTaskChain.update.mockReturnValue(fetchTaskChain);

    const cancelTaskChain = {
      select: vi.fn(),
      eq: vi.fn(),
      update: vi.fn(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({
        data: { id: 'task-1', status: 'Cancelled' },
        error: null,
      }),
    } as MockChain;
    cancelTaskChain.select.mockReturnValue(cancelTaskChain);
    cancelTaskChain.eq.mockReturnValue(cancelTaskChain);
    cancelTaskChain.update.mockReturnValue(cancelTaskChain);

    mockFrom
      .mockReturnValueOnce(fetchTaskChain)
      .mockReturnValueOnce(cancelTaskChain);

    const { result } = renderHook(() => useCancelTask('proj-1'), {
      wrapper: createTaskCancellationWrapper(queryClient),
    });

    await expect(result.current.mutateAsync('task-1')).resolves.toBeUndefined();

    expect(fetchTaskChain.select).toHaveBeenCalledWith('*');
    expect(fetchTaskChain.eq).toHaveBeenCalledWith('id', 'task-1');
    expect(cancelTaskChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'Cancelled',
        updated_at: expect.any(String),
      })
    );
    expect(cancelTaskChain.eq).toHaveBeenCalledWith('id', 'task-1');
    expect(cancelTaskChain.select).toHaveBeenCalledWith('id, status');

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['tasks', 'paginated'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['task-status-counts'],
    });
    expect(
      invalidateSpy.mock.calls.some(
        ([arg]) => Boolean(arg && typeof (arg as { predicate?: unknown }).predicate === 'function')
      )
    ).toBe(true);
    expect(mockHandleError).not.toHaveBeenCalled();
  });

  it('cancels orchestrator subtasks when present', async () => {
    const queryClient = createQueryClient();

    const fetchTaskChain = {
      select: vi.fn(),
      eq: vi.fn(),
      update: vi.fn(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'orch-1',
          status: 'Queued',
          task_type: 'join_clips_orchestrator',
          project_id: 'proj-1',
        },
        error: null,
      }),
    } as MockChain;
    fetchTaskChain.select.mockReturnValue(fetchTaskChain);
    fetchTaskChain.eq.mockReturnValue(fetchTaskChain);
    fetchTaskChain.update.mockReturnValue(fetchTaskChain);

    const cancelTaskChain = {
      select: vi.fn(),
      eq: vi.fn(),
      update: vi.fn(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({
        data: { id: 'orch-1', status: 'Cancelled' },
        error: null,
      }),
    } as MockChain;
    cancelTaskChain.select.mockReturnValue(cancelTaskChain);
    cancelTaskChain.eq.mockReturnValue(cancelTaskChain);
    cancelTaskChain.update.mockReturnValue(cancelTaskChain);

    const fetchSubtasksChain = {
      select: vi.fn(),
      eq: vi.fn(),
      update: vi.fn(),
      in: vi.fn().mockResolvedValue({
        data: [
          { id: 'sub-1', params: { orchestrator_task_id_ref: 'orch-1' } },
          { id: 'sub-2', params: { orchestrator_task_id: 'orch-1' } },
          { id: 'other', params: { orchestrator_task_id_ref: 'different' } },
        ],
        error: null,
      }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as MockChain;
    fetchSubtasksChain.select.mockReturnValue(fetchSubtasksChain);
    fetchSubtasksChain.eq.mockReturnValue(fetchSubtasksChain);
    fetchSubtasksChain.update.mockReturnValue(fetchSubtasksChain);

    const cancelSubtasksChain = {
      select: vi.fn(),
      eq: vi.fn(),
      update: vi.fn(),
      in: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as MockChain;
    cancelSubtasksChain.select.mockReturnValue(cancelSubtasksChain);
    cancelSubtasksChain.eq.mockReturnValue(cancelSubtasksChain);
    cancelSubtasksChain.update.mockReturnValue(cancelSubtasksChain);

    mockFrom
      .mockReturnValueOnce(fetchTaskChain)
      .mockReturnValueOnce(cancelTaskChain)
      .mockReturnValueOnce(fetchSubtasksChain)
      .mockReturnValueOnce(cancelSubtasksChain);

    const { result } = renderHook(() => useCancelTask('proj-1'), {
      wrapper: createTaskCancellationWrapper(queryClient),
    });

    await expect(result.current.mutateAsync('orch-1')).resolves.toBeUndefined();

    expect(fetchSubtasksChain.eq).toHaveBeenCalledWith('project_id', 'proj-1');
    expect(fetchSubtasksChain.in).toHaveBeenCalledWith('status', ['Queued']);
    expect(cancelSubtasksChain.in).toHaveBeenCalledWith('id', ['sub-1', 'sub-2']);
    expect(mockHandleError).not.toHaveBeenCalled();
  });

  it('reports an error when the task is already terminal', async () => {
    const queryClient = createQueryClient();

    const fetchTaskChain = {
      select: vi.fn(),
      eq: vi.fn(),
      update: vi.fn(),
      in: vi.fn().mockResolvedValue({ data: [], error: null }),
      single: vi.fn().mockResolvedValue({
        data: {
          id: 'task-1',
          status: 'Complete',
          task_type: 'image-generation',
          project_id: 'proj-1',
        },
        error: null,
      }),
    } as MockChain;
    fetchTaskChain.select.mockReturnValue(fetchTaskChain);
    fetchTaskChain.eq.mockReturnValue(fetchTaskChain);
    fetchTaskChain.update.mockReturnValue(fetchTaskChain);

    mockFrom.mockReturnValueOnce(fetchTaskChain);

    const { result } = renderHook(() => useCancelTask('proj-1'), {
      wrapper: createTaskCancellationWrapper(queryClient),
    });

    await expect(result.current.mutateAsync('task-1')).rejects.toThrow('Task is already Complete');

    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockHandleError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'useCancelTask',
        toastTitle: 'Failed to cancel task',
      })
    );
  });
});

describe('useCancelAllPendingTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('cancels pending tasks and orchestrator subtasks in one batch', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const pendingTasksChain = {
      select: vi.fn(),
      eq: vi.fn(),
      update: vi.fn(),
      in: vi.fn().mockResolvedValue({
        data: [
          { id: 'orch-1', task_type: 'travel_orchestrator' },
          { id: 'task-1', task_type: 'image-generation' },
        ],
        error: null,
      }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as MockChain;
    pendingTasksChain.select.mockReturnValue(pendingTasksChain);
    pendingTasksChain.eq.mockReturnValue(pendingTasksChain);
    pendingTasksChain.update.mockReturnValue(pendingTasksChain);

    const allProjectTasksChain = {
      select: vi.fn(),
      eq: vi.fn(),
      update: vi.fn(),
      in: vi.fn().mockResolvedValue({
        data: [
          { id: 'sub-1', params: { orchestrator_task_id_ref: 'orch-1' } },
          { id: 'sub-2', params: { orchestrator_task_id: 'orch-1' } },
          { id: 'other', params: { orchestrator_task_id_ref: 'different' } },
        ],
        error: null,
      }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as MockChain;
    allProjectTasksChain.select.mockReturnValue(allProjectTasksChain);
    allProjectTasksChain.eq.mockReturnValue(allProjectTasksChain);
    allProjectTasksChain.update.mockReturnValue(allProjectTasksChain);

    const cancelBatchChain = {
      select: vi.fn(),
      eq: vi.fn(),
      update: vi.fn(),
      in: vi.fn().mockResolvedValue({ data: null, error: null }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as MockChain;
    cancelBatchChain.select.mockReturnValue(cancelBatchChain);
    cancelBatchChain.eq.mockReturnValue(cancelBatchChain);
    cancelBatchChain.update.mockReturnValue(cancelBatchChain);

    mockFrom
      .mockReturnValueOnce(pendingTasksChain)
      .mockReturnValueOnce(allProjectTasksChain)
      .mockReturnValueOnce(cancelBatchChain);

    const { result } = renderHook(() => useCancelAllPendingTasks(), {
      wrapper: createTaskCancellationWrapper(queryClient),
    });

    await expect(result.current.mutateAsync('proj-1')).resolves.toEqual({
      cancelledCount: 4,
      message: '4 tasks cancelled (including subtasks)',
    });

    expect(cancelBatchChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'Cancelled',
        updated_at: expect.any(String),
      })
    );
    expect(cancelBatchChain.in).toHaveBeenCalledWith(
      'id',
      expect.arrayContaining(['orch-1', 'task-1', 'sub-1', 'sub-2'])
    );
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['tasks', 'paginated'],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['task-status-counts'],
    });
    expect(mockHandleError).not.toHaveBeenCalled();
  });

  it('surfaces fetch errors through the mutation error handler', async () => {
    const queryClient = createQueryClient();

    const pendingTasksChain = {
      select: vi.fn(),
      eq: vi.fn(),
      update: vi.fn(),
      in: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'read failed' },
      }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as MockChain;
    pendingTasksChain.select.mockReturnValue(pendingTasksChain);
    pendingTasksChain.eq.mockReturnValue(pendingTasksChain);
    pendingTasksChain.update.mockReturnValue(pendingTasksChain);

    mockFrom.mockReturnValueOnce(pendingTasksChain);

    const { result } = renderHook(() => useCancelAllPendingTasks(), {
      wrapper: createTaskCancellationWrapper(queryClient),
    });

    await expect(result.current.mutateAsync('proj-1')).rejects.toThrow(
      'Failed to fetch pending tasks: read failed'
    );
    expect(mockHandleError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'useCancelPendingTasks',
        toastTitle: 'Failed to cancel pending tasks',
      })
    );
  });
});
