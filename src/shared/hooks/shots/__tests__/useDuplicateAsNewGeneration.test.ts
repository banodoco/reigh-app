import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { queryKeys } from '@/shared/lib/queryKeys';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  enqueueGenerationsInvalidation: vi.fn(),
  invalidateShotsQueries: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => ({
    rpc: (...args: unknown[]) => mocks.rpc(...args),
  }),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: { error: vi.fn() },
}));

vi.mock('@/shared/hooks/invalidation', () => ({
  enqueueGenerationsInvalidation: (...args: unknown[]) => mocks.enqueueGenerationsInvalidation(...args),
}));

vi.mock('@/shared/hooks/shots/cacheUtils', () => ({
  invalidateShotsQueries: (...args: unknown[]) => mocks.invalidateShotsQueries(...args),
}));

import { useDuplicateAsNewGeneration } from '../useDuplicateAsNewGeneration';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: queryClient }, children),
  };
}

describe('useDuplicateAsNewGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a mutation hook', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDuplicateAsNewGeneration(), { wrapper });

    expect(result.current).toHaveProperty('mutateAsync');
    expect(result.current).toHaveProperty('isPending');
  });

  it('duplicates via RPC and preserves targeted invalidations', async () => {
    const rpcSingle = vi.fn().mockResolvedValue({
      data: {
        new_generation_id: 'gen-new',
        new_shot_generation_id: 'sg-new',
        timeline_frame: 75,
        location: 'https://example.com/image.png',
        thumbnail_url: 'https://example.com/thumb.png',
        type: 'image',
        params: { prompt: 'test' },
        created_at: '2026-04-06T00:00:00.000Z',
      },
      error: null,
    });
    mocks.rpc.mockReturnValue({ single: rpcSingle });

    const { queryClient, wrapper } = createWrapper();
    const invalidateQueriesSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useDuplicateAsNewGeneration(), { wrapper });

    let data: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => {
      data = await result.current.mutateAsync({
        shot_id: 'shot-1',
        generation_id: 'gen-1',
        project_id: 'project-1',
        timeline_frame: 50,
        next_timeline_frame: 100,
      });
    });

    expect(mocks.rpc).toHaveBeenCalledWith('duplicate_as_new_generation', expect.objectContaining({
      p_shot_id: 'shot-1',
      p_generation_id: 'gen-1',
      p_project_id: 'project-1',
      p_timeline_frame: 50,
      p_next_timeline_frame: 100,
    }));
    expect(rpcSingle).toHaveBeenCalledTimes(1);
    expect(mocks.enqueueGenerationsInvalidation).toHaveBeenCalledWith(queryClient, 'shot-1', {
      reason: 'duplicate-as-new-generation',
      scope: 'all',
      includeShots: false,
      projectId: 'project-1',
      includeProjectUnified: true,
    });
    expect(mocks.invalidateShotsQueries).toHaveBeenCalledWith(queryClient, 'project-1', {
      refetchType: 'inactive',
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.generations.derivedGenerations('gen-1'),
    });
    expect(invalidateQueriesSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.segments.parents('shot-1', 'project-1'),
    });
    expect(data).toEqual({
      shot_id: 'shot-1',
      original_generation_id: 'gen-1',
      new_generation_id: 'gen-new',
      new_shot_generation_id: 'sg-new',
      timeline_frame: 75,
      project_id: 'project-1',
      location: 'https://example.com/image.png',
      thumbnail_url: 'https://example.com/thumb.png',
      type: 'image',
      params: { prompt: 'test' },
      created_at: '2026-04-06T00:00:00.000Z',
    });
  });
});
