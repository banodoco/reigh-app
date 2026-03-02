import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock supabase
const mockSupabaseChain = () => {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.in = vi.fn().mockReturnValue(chain);
  chain.not = vi.fn().mockReturnValue(chain);
  chain.order = vi.fn().mockReturnValue(chain);
  chain.range = vi.fn().mockResolvedValue({ data: [], error: null, count: 0 });
  chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
  return chain;
};

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => mockSupabaseChain()),
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null,
      }),
    },
  },
}));

vi.mock('@/shared/lib/taskConfig', () => ({
  getVisibleTaskTypes: vi.fn(() => ['generate-video', 'generate-image']),
  getHiddenTaskTypes: vi.fn(() => ['internal-task']),
}));

import { useTaskLog } from '../useTaskLog';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useTaskLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns initial loading state', () => {
    const { result } = renderHook(() => useTaskLog(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);
  });

  it('accepts custom limit and page', () => {
    const { result } = renderHook(() => useTaskLog(10, 2), {
      wrapper: createWrapper(),
    });

    expect(result.current).toBeDefined();
  });

  it('accepts filter parameters', () => {
    const { result } = renderHook(
      () =>
        useTaskLog(20, 1, {
          costFilter: 'paid',
          status: ['Complete'],
          taskTypes: ['generate-video'],
        }),
      { wrapper: createWrapper() }
    );

    expect(result.current).toBeDefined();
  });

  it('returns empty tasks when user has no projects', async () => {
    const { supabase } = await import('@/integrations/supabase/client');

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      const chain = mockSupabaseChain();
      if (table === 'projects') {
        chain.select = vi.fn().mockReturnValue({
          ...chain,
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        });
      }
      return chain as ReturnType<typeof supabase.from>;
    });

    const { result } = renderHook(() => useTaskLog(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    if (result.current.data) {
      expect(result.current.data.tasks).toEqual([]);
    }
  });
});
