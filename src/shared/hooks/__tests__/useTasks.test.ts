import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock supabase
vi.mock('@/integrations/supabase/client', () => {
  const createChain = () => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.in = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);
    chain.not = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.range = vi.fn().mockResolvedValue({ data: [], error: null });
    chain.limit = vi.fn().mockResolvedValue({ data: [], error: null });
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
    return chain;
  };

  return {
    getSupabaseClient: vi.fn(() => ({
      from: vi.fn(() => createChain()),
    })),
  };
});

vi.mock('@/shared/hooks/useSmartPolling', () => ({
  useSmartPollingConfig: vi.fn(() => ({
    refetchInterval: false,
    staleTime: 30000,
  })),
}));

vi.mock('@/shared/lib/taskConfig', () => ({
  filterVisibleTasks: vi.fn((tasks: unknown[]) => tasks),
  getVisibleTaskTypes: vi.fn(() => ['generate-video', 'generate-image']),
}));

vi.mock('@/shared/lib/queryDefaults', () => ({
  QUERY_PRESETS: {
    realtimeBacked: { staleTime: 0 },
    immutable: { staleTime: Infinity },
  },
  STANDARD_RETRY: 3,
  STANDARD_RETRY_DELAY: vi.fn(() => 1000),
}));

vi.mock('@/shared/lib/queryKeys', () => ({
  queryKeys: {
    tasks: {
      single: (id: string) => ['tasks', id],
      paginated: (projectId: string) => ['tasks', 'paginated', projectId],
      paginatedAll: ['tasks', 'paginated'],
      statusCountsAll: ['tasks', 'statusCounts'],
      all: ['tasks'],
    },
  },
}));

vi.mock('@/shared/realtime/DataFreshnessManager', () => ({
  dataFreshnessManager: {
    onFetchFailure: vi.fn(),
    onFetchSuccess: vi.fn(),
  },
}));

import { useGetTask, usePaginatedTasks, mapDbTaskToTask } from '../useTasks';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('mapDbTaskToTask', () => {
  it('converts snake_case DB row to camelCase Task', () => {
    const row = {
      id: 'task-1',
      task_type: 'generate-video',
      params: { prompt: 'test' },
      status: 'Complete',
      dependant_on: ['task-0'],
      output_location: '/output.mp4',
      created_at: '2025-01-15T12:00:00Z',
      updated_at: '2025-01-15T12:05:00Z',
      project_id: 'proj-1',
      cost_cents: 100,
      generation_started_at: '2025-01-15T12:01:00Z',
      generation_processed_at: '2025-01-15T12:04:00Z',
      error_message: null,
    };

    const result = mapDbTaskToTask(row);

    expect(result).toEqual({
      id: 'task-1',
      taskType: 'generate-video',
      params: { prompt: 'test' },
      status: 'Complete',
      dependantOn: ['task-0'],
      outputLocation: '/output.mp4',
      createdAt: '2025-01-15T12:00:00Z',
      updatedAt: '2025-01-15T12:05:00Z',
      projectId: 'proj-1',
      costCents: 100,
      generationStartedAt: '2025-01-15T12:01:00Z',
      generationProcessedAt: '2025-01-15T12:04:00Z',
      errorMessage: undefined,
    });
  });

  it('handles null optional fields', () => {
    const row = {
      id: 'task-2',
      task_type: 'generate-image',
      params: null,
      status: 'Queued',
      dependant_on: null,
      output_location: null,
      created_at: '2025-01-15T12:00:00Z',
      updated_at: null,
      project_id: 'proj-1',
      cost_cents: null,
      generation_started_at: null,
      generation_processed_at: null,
      error_message: null,
    };

    const result = mapDbTaskToTask(row);

    expect(result.dependantOn).toBeUndefined();
    expect(result.outputLocation).toBeUndefined();
    expect(result.updatedAt).toBeUndefined();
    expect(result.costCents).toBeUndefined();
    expect(result.generationStartedAt).toBeUndefined();
    expect(result.generationProcessedAt).toBeUndefined();
    expect(result.errorMessage).toBeUndefined();
  });
});

describe('useGetTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is disabled when taskId is empty', () => {
    const { result } = renderHook(() => useGetTask('', 'project-1'), {
      wrapper: createWrapper(),
    });

    expect(result.current.data).toBeUndefined();
    expect(result.current.isFetching).toBe(false);
  });

  it('fetches task data for valid taskId', () => {
    const { result } = renderHook(() => useGetTask('task-1', 'project-1'), {
      wrapper: createWrapper(),
    });

    // Should start fetching
    expect(result.current.isLoading).toBe(true);
  });
});

describe('usePaginatedTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is disabled when no projectId', () => {
    const { result } = renderHook(
      () =>
        usePaginatedTasks({
          projectId: null,
          status: ['Complete'],
          limit: 20,
          offset: 0,
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current.isFetching).toBe(false);
  });

  it('starts fetching when projectId is provided', () => {
    const { result } = renderHook(
      () =>
        usePaginatedTasks({
          projectId: 'project-1',
          status: ['Complete'],
          limit: 20,
          offset: 0,
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current.isLoading).toBe(true);
  });

  it('accepts taskType filter', () => {
    const { result } = renderHook(
      () =>
        usePaginatedTasks({
          projectId: 'project-1',
          taskType: 'generate-video',
          limit: 20,
          offset: 0,
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current).toBeDefined();
  });
});
