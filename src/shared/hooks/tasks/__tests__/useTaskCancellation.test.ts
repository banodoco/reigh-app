import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const { mockFrom, mockHandleError, mockInvokeWithTimeout, mockRequireSession } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockHandleError: vi.fn(),
  mockInvokeWithTimeout: vi.fn(),
  mockRequireSession: vi.fn().mockResolvedValue({
    access_token: 'session-token',
    user: { id: 'user-1' },
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    auth: {
      getSession: vi.fn(),
    },
    from: mockFrom,
  }),
}));

vi.mock('@/integrations/supabase/auth/ensureAuthenticatedSession', () => ({
  requireSession: (...args: unknown[]) => mockRequireSession(...args),
}));

vi.mock('@/integrations/supabase/functions/invokeSupabaseEdgeFunction', () => ({
  invokeSupabaseEdgeFunction: (...args: unknown[]) => mockInvokeWithTimeout(...args),
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
    mockRequireSession.mockResolvedValue({
      access_token: 'session-token',
      user: { id: 'user-1' },
    });
    mockInvokeWithTimeout.mockResolvedValue({});
  });

  it('cancels a queued task and invalidates relevant queries', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const fetchTaskChain = {
      select: vi.fn(),
      eq: vi.fn(),
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
    mockFrom.mockReturnValueOnce(fetchTaskChain);

    const { result } = renderHook(() => useCancelTask('proj-1'), {
      wrapper: createTaskCancellationWrapper(queryClient),
    });

    await expect(result.current.mutateAsync('task-1')).resolves.toBeUndefined();

    expect(fetchTaskChain.select).toHaveBeenCalledWith('*');
    expect(fetchTaskChain.eq).toHaveBeenCalledWith('id', 'task-1');
    expect(mockRequireSession).toHaveBeenCalled();
    expect(mockInvokeWithTimeout).toHaveBeenCalledWith('update-task-status', expect.objectContaining({
      body: { task_id: 'task-1', status: 'Cancelled' },
      headers: { Authorization: 'Bearer session-token' },
    }));

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

    const fetchSubtasksChain = {
      select: vi.fn(),
      eq: vi.fn(),
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

    mockFrom
      .mockReturnValueOnce(fetchTaskChain)
      .mockReturnValueOnce(fetchSubtasksChain);

    const { result } = renderHook(() => useCancelTask('proj-1'), {
      wrapper: createTaskCancellationWrapper(queryClient),
    });

    await expect(result.current.mutateAsync('orch-1')).resolves.toBeUndefined();

    expect(fetchSubtasksChain.eq).toHaveBeenCalledWith('project_id', 'proj-1');
    expect(fetchSubtasksChain.in).toHaveBeenCalledWith('status', ['Queued']);
    expect(mockInvokeWithTimeout).toHaveBeenCalledTimes(3);
    expect(mockInvokeWithTimeout).toHaveBeenNthCalledWith(1, 'update-task-status', expect.objectContaining({
      body: { task_id: 'orch-1', status: 'Cancelled' },
    }));
    expect(mockInvokeWithTimeout).toHaveBeenNthCalledWith(2, 'update-task-status', expect.objectContaining({
      body: { task_id: 'sub-1', status: 'Cancelled' },
    }));
    expect(mockInvokeWithTimeout).toHaveBeenNthCalledWith(3, 'update-task-status', expect.objectContaining({
      body: { task_id: 'sub-2', status: 'Cancelled' },
    }));
    expect(mockHandleError).not.toHaveBeenCalled();
  });

  it('reports an error when the task is already terminal', async () => {
    const queryClient = createQueryClient();

    const fetchTaskChain = {
      select: vi.fn(),
      eq: vi.fn(),
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
    mockRequireSession.mockResolvedValue({
      access_token: 'session-token',
      user: { id: 'user-1' },
    });
    mockInvokeWithTimeout.mockResolvedValue({});
  });

  it('cancels pending tasks and orchestrator subtasks in one batch', async () => {
    const queryClient = createQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    // The source fetches all pending tasks in one query, then searches within
    // those results for orchestrator subtasks (no second query).
    const pendingTasksChain = {
      select: vi.fn(),
      eq: vi.fn(),
      in: vi.fn().mockResolvedValue({
        data: [
          { id: 'orch-1', task_type: 'travel_orchestrator', params: null },
          { id: 'task-1', task_type: 'image-generation', params: null },
          { id: 'sub-1', task_type: 'travel_video', params: { orchestrator_task_id_ref: 'orch-1' } },
          { id: 'sub-2', task_type: 'travel_video', params: { orchestrator_task_id: 'orch-1' } },
        ],
        error: null,
      }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as MockChain;
    pendingTasksChain.select.mockReturnValue(pendingTasksChain);
    pendingTasksChain.eq.mockReturnValue(pendingTasksChain);
    mockFrom.mockReturnValueOnce(pendingTasksChain);

    const { result } = renderHook(() => useCancelAllPendingTasks(), {
      wrapper: createTaskCancellationWrapper(queryClient),
    });

    await expect(result.current.mutateAsync('proj-1')).resolves.toEqual({
      cancelledCount: 4,
      message: '4 tasks cancelled (including subtasks)',
    });

    expect(mockRequireSession).toHaveBeenCalled();
    expect(mockInvokeWithTimeout).toHaveBeenCalledTimes(4);
    expect(mockInvokeWithTimeout.mock.calls.map(([_, options]) => options)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ body: { task_id: 'orch-1', status: 'Cancelled' } }),
        expect.objectContaining({ body: { task_id: 'task-1', status: 'Cancelled' } }),
        expect.objectContaining({ body: { task_id: 'sub-1', status: 'Cancelled' } }),
        expect.objectContaining({ body: { task_id: 'sub-2', status: 'Cancelled' } }),
      ]),
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
      in: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'read failed' },
      }),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as MockChain;
    pendingTasksChain.select.mockReturnValue(pendingTasksChain);
    pendingTasksChain.eq.mockReturnValue(pendingTasksChain);

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
