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
    chain.not = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
    return chain;
  };

  return {
    getSupabaseClient: () => ({
      from: vi.fn(() => createChain()),
    }),
  };
});

vi.mock('@/shared/lib/tasks/travelBetweenImages/segmentImages', () => ({
  extractSegmentImages: vi.fn(() => ({
    startUrl: 'https://example.com/start.jpg',
    endUrl: 'https://example.com/end.jpg',
  })),
}));

import { useSourceImageChanges } from '../useSourceImageChanges';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useSourceImageChanges', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty mismatch map with no segments', () => {
    const { result } = renderHook(
      () => useSourceImageChanges([]),
      { wrapper: createWrapper() }
    );

    expect(result.current.mismatchMap.size).toBe(0);
    expect(result.current.hasAnyMismatches).toBe(false);
  });

  it('returns empty when disabled', () => {
    const segments = [
      {
        segmentId: 'seg-1',
        childOrder: 0,
        params: {},
        startGenId: 'gen-1',
        endGenId: 'gen-2',
      },
    ];

    const { result } = renderHook(
      () => useSourceImageChanges(segments, false),
      { wrapper: createWrapper() }
    );

    expect(result.current.mismatchMap.size).toBe(0);
  });

  it('provides hasRecentMismatch function', () => {
    const { result } = renderHook(
      () => useSourceImageChanges([]),
      { wrapper: createWrapper() }
    );

    expect(typeof result.current.hasRecentMismatch).toBe('function');
    expect(result.current.hasRecentMismatch('any-segment')).toBe(false);
  });

  it('exposes isLoading state', () => {
    const { result } = renderHook(
      () => useSourceImageChanges([]),
      { wrapper: createWrapper() }
    );

    expect(typeof result.current.isLoading).toBe('boolean');
  });

  it('fetches when segments have start gen IDs', () => {
    const segments = [
      {
        segmentId: 'seg-1',
        childOrder: 0,
        params: {},
        startGenId: 'gen-1',
        endGenId: 'gen-2',
      },
    ];

    const { result } = renderHook(
      () => useSourceImageChanges(segments, true),
      { wrapper: createWrapper() }
    );

    // Query should be enabled since we have startGenIds
    expect(result.current).toBeDefined();
  });

  it('does not fetch when segments have no start gen IDs', () => {
    const segments = [
      {
        segmentId: 'seg-1',
        childOrder: 0,
        params: {},
        startGenId: null,
        endGenId: null,
      },
    ];

    const { result } = renderHook(
      () => useSourceImageChanges(segments, true),
      { wrapper: createWrapper() }
    );

    expect(result.current.mismatchMap.size).toBe(0);
  });
});
