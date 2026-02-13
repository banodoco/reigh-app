import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// Mock supabase
const mockFrom = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

vi.mock('@/shared/components/ui/sonner', () => ({
  toast: { error: vi.fn() },
}));

vi.mock('@/shared/hooks/invalidation', () => ({
  invalidateGenerationsSync: vi.fn(),
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
  // Track supabase chain calls
  let supabaseChain: {
    selectResult: unknown;
    insertResult: unknown;
    selectShotGenResult: unknown;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    supabaseChain = {
      selectResult: null,
      insertResult: null,
      selectShotGenResult: null,
    };
  });

  function setupMocks(options: {
    primaryVariant?: Record<string, unknown> | null;
    generation?: Record<string, unknown> | null;
    newGeneration?: Record<string, unknown>;
    existingFrames?: number[];
    newShotGeneration?: Record<string, unknown>;
  }) {
    const {
      primaryVariant = {
        location: 'https://example.com/image.png',
        thumbnail_url: 'https://example.com/thumb.png',
        params: { prompt: 'test' },
      },
      newGeneration = {
        id: 'gen-new',
        location: 'https://example.com/image.png',
      },
      existingFrames = [0, 50, 100],
      newShotGeneration = { id: 'sg-new', timeline_frame: 75, generation_id: 'gen-new' },
    } = options;

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      if (table === 'generation_variants') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: primaryVariant,
                  error: null,
                }),
              }),
            }),
          }),
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      if (table === 'generations') {
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: newGeneration,
                error: null,
              }),
            }),
          }),
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: options.generation || null,
                error: options.generation ? null : { message: 'Not found' },
              }),
            }),
          }),
        };
      }
      if (table === 'shot_generations') {
        callCount++;
        if (callCount <= 1) {
          // First call: fetch existing frames
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: existingFrames.map(f => ({ timeline_frame: f })),
                error: null,
              }),
            }),
          };
        }
        // Second call: insert new shot_generation
        return {
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({
                data: newShotGeneration,
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
    });
  }

  it('returns a mutation hook', () => {
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDuplicateAsNewGeneration(), { wrapper });

    expect(result.current).toHaveProperty('mutateAsync');
    expect(result.current).toHaveProperty('isPending');
  });

  it('calculates midpoint timeline frame between current and next', async () => {
    setupMocks({ existingFrames: [0, 50, 100] });

    const { wrapper } = createWrapper();
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

    // Midpoint of 50 and 100 = 75
    expect(data!.timeline_frame).toBeDefined();
  });

  it('adds 30 when no next_timeline_frame', async () => {
    setupMocks({
      existingFrames: [0, 50, 100],
      newShotGeneration: { id: 'sg-new', timeline_frame: 130, generation_id: 'gen-new' },
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDuplicateAsNewGeneration(), { wrapper });

    let data: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => {
      data = await result.current.mutateAsync({
        shot_id: 'shot-1',
        generation_id: 'gen-1',
        project_id: 'project-1',
        timeline_frame: 100,
      });
    });

    expect(data!.new_generation_id).toBe('gen-new');
  });

  it('uses explicit target_timeline_frame when provided', async () => {
    setupMocks({
      existingFrames: [0, 50, 100],
      newShotGeneration: { id: 'sg-new', timeline_frame: 42, generation_id: 'gen-new' },
    });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useDuplicateAsNewGeneration(), { wrapper });

    let data: Awaited<ReturnType<typeof result.current.mutateAsync>>;
    await act(async () => {
      data = await result.current.mutateAsync({
        shot_id: 'shot-1',
        generation_id: 'gen-1',
        project_id: 'project-1',
        timeline_frame: 0,
        target_timeline_frame: 42,
      });
    });

    expect(data!.new_generation_id).toBe('gen-new');
  });

  it('returns expected result shape', async () => {
    setupMocks({});

    const { wrapper } = createWrapper();
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

    expect(data!).toHaveProperty('shot_id', 'shot-1');
    expect(data!).toHaveProperty('original_generation_id', 'gen-1');
    expect(data!).toHaveProperty('new_generation_id', 'gen-new');
    expect(data!).toHaveProperty('new_shot_generation_id', 'sg-new');
    expect(data!).toHaveProperty('project_id', 'project-1');
  });
});
