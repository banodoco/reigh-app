import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock supabase
const mockFrom = vi.fn();
const mockRpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('@/shared/components/ui/sonner', () => ({
  toast: { error: vi.fn() },
}));

vi.mock('@/shared/hooks/invalidation', () => ({
  invalidateGenerationsSync: vi.fn(),
}));

vi.mock('@/shared/constants/supabaseErrors', () => ({
  isNotFoundError: () => false,
}));

vi.mock('@/shared/utils/timelinePositionCalculator', () => ({
  calculateNextAvailableFrame: vi.fn().mockReturnValue(150),
  ensureUniqueFrame: vi.fn().mockImplementation((frame: number) => frame),
}));

vi.mock('./cacheUtils', () => ({
  cancelShotsQueries: vi.fn().mockResolvedValue(undefined),
  findShotsCache: vi.fn().mockReturnValue(undefined),
  updateAllShotsCaches: vi.fn(),
  rollbackShotsCaches: vi.fn(),
  rollbackShotGenerationsCache: vi.fn(),
  cancelShotGenerationsQuery: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./shotMutationHelpers', () => ({
  isQuotaOrServerError: vi.fn().mockReturnValue(false),
  optimisticallyRemoveFromUnifiedGenerations: vi.fn(),
}));

import {
  useAddImageToShot,
  useRemoveImageFromShot,
  useUpdateShotImageOrder,
} from '../useShotGenerationMutations';

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

describe('useAddImageToShot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds an image with null timeline_frame (unpositioned)', async () => {
    const insertResult = {
      id: 'sg-new',
      shot_id: 'shot-1',
      generation_id: 'gen-1',
      timeline_frame: null,
    };

    mockFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: insertResult, error: null }),
        }),
      }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAddImageToShot(), { wrapper });

    let data: unknown;
    await act(async () => {
      data = await result.current.mutateAsync({
        shot_id: 'shot-1',
        generation_id: 'gen-1',
        project_id: 'project-1',
        timelineFrame: null,
      });
    });

    expect(data).toHaveProperty('id', 'sg-new');
    expect(mockFrom).toHaveBeenCalledWith('shot_generations');
  });

  it('uses RPC for auto-position when timelineFrame is undefined', async () => {
    const rpcResult = {
      id: 'sg-new',
      shot_id: 'shot-1',
      generation_id: 'gen-1',
      timeline_frame: 150,
    };

    mockRpc.mockResolvedValue({ data: rpcResult, error: null });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAddImageToShot(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        shot_id: 'shot-1',
        generation_id: 'gen-1',
        project_id: 'project-1',
        // timelineFrame not provided = undefined = auto-position
      });
    });

    expect(mockRpc).toHaveBeenCalledWith('add_generation_to_shot', {
      p_shot_id: 'shot-1',
      p_generation_id: 'gen-1',
      p_with_position: true,
    });
  });

  it('uses explicit frame with collision detection for number timelineFrame', async () => {
    // Mock fetch existing frames
    const existingGens = [{ timeline_frame: 0 }, { timeline_frame: 50 }];
    const insertResult = {
      id: 'sg-new',
      shot_id: 'shot-1',
      generation_id: 'gen-1',
      timeline_frame: 100,
    };

    let fromCallCount = 0;
    mockFrom.mockImplementation(() => {
      fromCallCount++;
      if (fromCallCount === 1) {
        // Fetch existing frames
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({ data: existingGens, error: null }),
            }),
          }),
        };
      }
      // Insert
      return {
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: insertResult, error: null }),
          }),
        }),
      };
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useAddImageToShot(), { wrapper });

    let data: unknown;
    await act(async () => {
      data = await result.current.mutateAsync({
        shot_id: 'shot-1',
        generation_id: 'gen-1',
        project_id: 'project-1',
        timelineFrame: 100,
      });
    });

    expect(data).toHaveProperty('timeline_frame', 100);
  });
});

describe('useRemoveImageFromShot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sets timeline_frame to null (unpositions)', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mockFrom.mockReturnValue({ update: mockUpdate });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRemoveImageFromShot(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        shotId: 'shot-1',
        shotGenerationId: 'sg-1',
        projectId: 'project-1',
      });
    });

    expect(mockFrom).toHaveBeenCalledWith('shot_generations');
    expect(mockUpdate).toHaveBeenCalledWith({ timeline_frame: null });
  });

  it('throws on missing required params', async () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRemoveImageFromShot(), { wrapper });

    await expect(
      act(async () => {
        await result.current.mutateAsync({
          shotId: '',
          shotGenerationId: 'sg-1',
          projectId: 'project-1',
        });
      })
    ).rejects.toThrow('Missing required parameters');
  });

  it('persists shift items via RPC', async () => {
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    mockRpc.mockResolvedValue({ error: null });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useRemoveImageFromShot(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        shotId: 'shot-1',
        shotGenerationId: 'sg-1',
        projectId: 'project-1',
        shiftItems: [
          { id: 'sg-2', newFrame: 0 },
          { id: 'sg-3', newFrame: 50 },
        ],
      });
    });

    expect(mockRpc).toHaveBeenCalledWith('batch_update_timeline_frames', {
      p_updates: expect.arrayContaining([
        expect.objectContaining({ shot_generation_id: 'sg-2', timeline_frame: 0 }),
        expect.objectContaining({ shot_generation_id: 'sg-3', timeline_frame: 50 }),
      ]),
    });
  });
});

describe('useUpdateShotImageOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('updates timeline frames for reordered items', async () => {
    const mockEq = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    });
    mockFrom.mockReturnValue({
      update: vi.fn().mockReturnValue({
        eq: mockEq,
      }),
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useUpdateShotImageOrder(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        updates: [
          { shot_id: 'shot-1', generation_id: 'gen-1', timeline_frame: 0 },
          { shot_id: 'shot-1', generation_id: 'gen-2', timeline_frame: 50 },
        ],
        projectId: 'project-1',
        shotId: 'shot-1',
      });
    });

    expect(mockFrom).toHaveBeenCalledWith('shot_generations');
  });
});
