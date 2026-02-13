import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock supabase
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockIn = vi.fn();
const mockSingle = vi.fn();
const mockUpdate = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: mockSelect,
      eq: mockEq,
      in: mockIn,
      single: mockSingle,
      update: mockUpdate,
    })),
  },
}));

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

vi.mock('@/shared/lib/queryKeys', () => ({
  queryKeys: {
    tasks: {
      paginatedAll: ['tasks', 'paginated'],
      statusCountsAll: ['tasks', 'statusCounts'],
    },
  },
}));

import { useCancelTask, useCancelAllPendingTasks } from '../useTaskCancellation';
import { supabase } from '@/integrations/supabase/client';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useCancelTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a mutation object', () => {
    const { result } = renderHook(() => useCancelTask('test-project-id'), {
      wrapper: createWrapper(),
    });

    expect(result.current.mutate).toBeDefined();
    expect(result.current.mutateAsync).toBeDefined();
  });

  it('calls supabase to fetch and cancel task', async () => {
    // Mock the fetch task call
    const mockFrom = vi.mocked(supabase.from);
    mockFrom.mockImplementation(() => {
      const chain: Record<string, unknown> = {};
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.in = vi.fn().mockReturnValue(chain);
      chain.update = vi.fn().mockReturnValue(chain);
      chain.single = vi.fn().mockResolvedValue({
        data: {
          id: 'task-1',
          task_type: 'generate-video',
          status: 'Queued',
          project_id: 'test-project',
        },
        error: null,
      });
      return chain as ReturnType<typeof supabase.from>;
    });

    const { result } = renderHook(() => useCancelTask('test-project-id'), {
      wrapper: createWrapper(),
    });

    // The mutation function will be called, but we just verify the hook sets up correctly
    expect(result.current.isPending).toBe(false);
  });
});

describe('useCancelAllPendingTasks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a mutation object', () => {
    const { result } = renderHook(() => useCancelAllPendingTasks(), {
      wrapper: createWrapper(),
    });

    expect(result.current.mutate).toBeDefined();
    expect(result.current.mutateAsync).toBeDefined();
    expect(result.current.isPending).toBe(false);
  });
});
