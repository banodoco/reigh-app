import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock supabase
vi.mock('@/integrations/supabase/client', () => {
  const mockFrom = vi.fn((table: string) => {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);

    if (table === 'shot_statistics') {
      chain.eq = vi.fn().mockResolvedValue({
        data: [
          { shot_id: 'shot-1', video_count: 3, final_video_count: 1 },
          { shot_id: 'shot-2', video_count: 0, final_video_count: 0 },
        ],
        error: null,
      });
    } else if (table === 'shots') {
      chain.eq = vi.fn().mockResolvedValue({
        data: [
          { id: 'shot-1', settings: null },
          { id: 'shot-2', settings: { 'travel-structure-video': { structure_video_path: '/path' } } },
        ],
        error: null,
      });
    }

    return chain;
  });

  return {
    supabase: { from: mockFrom },
  };
});

// Mock smart polling
vi.mock('@/shared/hooks/useSmartPolling', () => ({
  useSmartPollingConfig: vi.fn(() => ({
    refetchInterval: false,
    staleTime: 30000,
  })),
}));

vi.mock('@/shared/lib/queryKeys', () => ({
  queryKeys: {
    projectStats: {
      videos: (projectId: string) => ['project-stats', 'videos', projectId],
    },
  },
}));

import { useProjectVideoCountsCache } from '../useProjectVideoCountsCache';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useProjectVideoCountsCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns null values when projectId is null', () => {
    const { result } = renderHook(() => useProjectVideoCountsCache(null), {
      wrapper: createWrapper(),
    });

    expect(result.current.getShotVideoCount('shot-1')).toBeNull();
    expect(result.current.getFinalVideoCount('shot-1')).toBeNull();
    expect(result.current.getHasStructureVideo('shot-1')).toBeNull();
    expect(result.current.getAllShotCounts()).toBeNull();
  });

  it('returns null for null shotId', () => {
    const { result } = renderHook(
      () => useProjectVideoCountsCache('project-1'),
      { wrapper: createWrapper() }
    );

    expect(result.current.getShotVideoCount(null)).toBeNull();
    expect(result.current.getFinalVideoCount(null)).toBeNull();
    expect(result.current.getHasStructureVideo(null)).toBeNull();
  });

  it('provides clearCache function', () => {
    const { result } = renderHook(
      () => useProjectVideoCountsCache('project-1'),
      { wrapper: createWrapper() }
    );

    expect(typeof result.current.clearCache).toBe('function');
    // Should not throw
    expect(() => result.current.clearCache()).not.toThrow();
  });

  it('provides deleteProjectCache function', () => {
    const { result } = renderHook(
      () => useProjectVideoCountsCache('project-1'),
      { wrapper: createWrapper() }
    );

    expect(typeof result.current.deleteProjectCache).toBe('function');
    // Should not throw
    expect(() => result.current.deleteProjectCache('project-1')).not.toThrow();
    expect(() => result.current.deleteProjectCache(null)).not.toThrow();
  });

  it('provides invalidateOnVideoChanges function', () => {
    const { result } = renderHook(
      () => useProjectVideoCountsCache('project-1'),
      { wrapper: createWrapper() }
    );

    expect(typeof result.current.invalidateOnVideoChanges).toBe('function');
  });

  it('exposes loading state', () => {
    const { result } = renderHook(
      () => useProjectVideoCountsCache('project-1'),
      { wrapper: createWrapper() }
    );

    // Initially loading
    expect(typeof result.current.isLoading).toBe('boolean');
  });
});
