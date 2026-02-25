import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockSupabase,
  mockGetPrimaryTaskMappingsForGenerations,
  mockHandleError,
} = vi.hoisted(() => {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(),
  };

  const mockGetPrimaryTaskMappingsForGenerations = vi.fn();
  const mockHandleError = vi.fn();

  return { mockSupabase, mockGetPrimaryTaskMappingsForGenerations, mockHandleError };
});

vi.mock('@/integrations/supabase/client', () => ({
  getSupabaseClient: () => mockSupabase,
}));

vi.mock('@/shared/lib/queryKeys/tasks', () => ({
  taskQueryKeys: {
    generationMapping: (id: string) => ['generation-task-mapping', id],
    single: (id: string) => ['tasks', 'single', id],
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mockHandleError(...args),
}));

vi.mock('@/shared/lib/generationTaskRepository', () => ({
  getPrimaryTaskMappingsForGenerations: (...args: unknown[]) => mockGetPrimaryTaskMappingsForGenerations(...args),
  toGenerationTaskMappingCacheEntry: (mapping?: { taskId?: string | null; status?: string; queryError?: string }) => ({
    taskId: mapping?.taskId ?? null,
    status: mapping?.status ?? 'not_loaded',
    ...(mapping?.queryError ? { queryError: mapping.queryError } : {}),
  }),
}));

import {
  preloadGenerationTaskMappings,
  enhanceGenerationsWithTaskData,
} from '../generationTaskCache';

describe('preloadGenerationTaskMappings', () => {
  const mockQueryClient = {
    setQueryData: vi.fn(),
    prefetchQuery: vi.fn(),
    getQueryData: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.from.mockReturnThis();
    mockSupabase.select.mockReturnThis();
    mockSupabase.in.mockReturnThis();
    mockSupabase.eq.mockReturnThis();
    mockSupabase.single.mockResolvedValue({ data: { id: 'task-1' }, error: null });
  });

  it('does nothing for empty generation IDs', async () => {
    await preloadGenerationTaskMappings([], mockQueryClient as unknown as Parameters<typeof preloadGenerationTaskMappings>[1]);
    expect(mockGetPrimaryTaskMappingsForGenerations).not.toHaveBeenCalled();
  });

  it('fetches and caches task mappings', async () => {
    mockGetPrimaryTaskMappingsForGenerations.mockResolvedValue(
      new Map([
        ['gen-1', { generationId: 'gen-1', taskId: 'task-1', status: 'ok' }],
        ['gen-2', { generationId: 'gen-2', taskId: 'task-2', status: 'ok' }],
      ]),
    );

    await preloadGenerationTaskMappings(
      ['gen-1', 'gen-2'],
      mockQueryClient as unknown as Parameters<typeof preloadGenerationTaskMappings>[1],
    );

    expect(mockQueryClient.setQueryData).toHaveBeenCalledTimes(2);
    expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
      ['generation-task-mapping', 'gen-1'],
      { taskId: 'task-1', status: 'ok' },
    );
    expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
      ['generation-task-mapping', 'gen-2'],
      { taskId: 'task-2', status: 'ok' },
    );
  });

  it('handles generations with no tasks', async () => {
    mockGetPrimaryTaskMappingsForGenerations.mockResolvedValue(
      new Map([['gen-1', { generationId: 'gen-1', taskId: null, status: 'ok' }]]),
    );

    await preloadGenerationTaskMappings(
      ['gen-1'],
      mockQueryClient as unknown as Parameters<typeof preloadGenerationTaskMappings>[1],
    );

    expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
      ['generation-task-mapping', 'gen-1'],
      { taskId: null, status: 'ok' },
    );
  });

  it('records query failures without throwing', async () => {
    mockGetPrimaryTaskMappingsForGenerations.mockResolvedValue(
      new Map([[
        'gen-1',
        {
          generationId: 'gen-1',
          taskId: null,
          status: 'query_failed',
          queryError: 'DB error',
        },
      ]]),
    );

    await expect(
      preloadGenerationTaskMappings(
        ['gen-1'],
        mockQueryClient as unknown as Parameters<typeof preloadGenerationTaskMappings>[1],
      ),
    ).resolves.not.toThrow();

    expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
      ['generation-task-mapping', 'gen-1'],
      { taskId: null, status: 'query_failed', queryError: 'DB error' },
    );
    expect(mockHandleError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ context: 'GenerationTaskCache', showToast: false }),
    );
  });

  it('batches requests according to batchSize', async () => {
    mockGetPrimaryTaskMappingsForGenerations.mockResolvedValue(new Map());
    const ids = Array.from({ length: 12 }, (_, i) => `gen-${i}`);

    await preloadGenerationTaskMappings(
      ids,
      mockQueryClient as unknown as Parameters<typeof preloadGenerationTaskMappings>[1],
      {
        batchSize: 5,
        delayBetweenBatches: 0,
      },
    );

    expect(mockGetPrimaryTaskMappingsForGenerations).toHaveBeenCalledTimes(3);
  });
});

describe('enhanceGenerationsWithTaskData', () => {
  const mockQueryClient = {
    setQueryData: vi.fn(),
    prefetchQuery: vi.fn(),
    getQueryData: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds taskId from cache', () => {
    mockQueryClient.getQueryData.mockImplementation((key: string[]) => {
      if (key[0] === 'generation-task-mapping' && key[1] === 'gen-1') {
        return { taskId: 'task-1', status: 'ok' };
      }
      if (key[0] === 'tasks' && key[1] === 'single' && key[2] === 'task-1') {
        return { id: 'task-1' };
      }
      return null;
    });

    const generations = [{ id: 'gen-1' }] as Array<{ id: string }>;
    const result = enhanceGenerationsWithTaskData(
      generations as Parameters<typeof enhanceGenerationsWithTaskData>[0],
      mockQueryClient as unknown as Parameters<typeof enhanceGenerationsWithTaskData>[1],
    );

    expect(result[0].taskId).toBe('task-1');
    expect(result[0].taskMappingStatus).toBe('ok');
  });

  it('returns null taskId when not cached', () => {
    mockQueryClient.getQueryData.mockReturnValue(undefined);

    const generations = [{ id: 'gen-1' }] as Array<{ id: string }>;
    const result = enhanceGenerationsWithTaskData(
      generations as Parameters<typeof enhanceGenerationsWithTaskData>[0],
      mockQueryClient as unknown as Parameters<typeof enhanceGenerationsWithTaskData>[1],
    );

    expect(result[0].taskId).toBeNull();
    expect(result[0].taskMappingStatus).toBe('not_loaded');
  });

  it('preserves original generation data', () => {
    mockQueryClient.getQueryData.mockReturnValue(undefined);

    const generations = [{ id: 'gen-1', type: 'video', location: '/path.mp4' }] as Array<{
      id: string;
      type: string;
      location: string;
    }>;
    const result = enhanceGenerationsWithTaskData(
      generations as Parameters<typeof enhanceGenerationsWithTaskData>[0],
      mockQueryClient as unknown as Parameters<typeof enhanceGenerationsWithTaskData>[1],
    );

    expect(result[0].id).toBe('gen-1');
    expect(result[0].type).toBe('video');
    expect(result[0].location).toBe('/path.mp4');
  });

  it('uses generation_id when present for mapping lookup', () => {
    mockQueryClient.getQueryData.mockImplementation((key: string[]) => {
      if (key[0] === 'generation-task-mapping' && key[1] === 'gen-root-1') {
        return { taskId: 'task-1', status: 'ok' };
      }
      return null;
    });

    const generations = [{ id: 'shot-gen-1', generation_id: 'gen-root-1' }] as Array<{
      id: string;
      generation_id: string;
    }>;
    const result = enhanceGenerationsWithTaskData(
      generations as Parameters<typeof enhanceGenerationsWithTaskData>[0],
      mockQueryClient as unknown as Parameters<typeof enhanceGenerationsWithTaskData>[1],
    );

    expect(result[0].taskId).toBe('task-1');
    expect(result[0].taskMappingStatus).toBe('ok');
  });

  it('propagates query_failed mapping metadata', () => {
    mockQueryClient.getQueryData.mockImplementation((key: string[]) => {
      if (key[0] === 'generation-task-mapping' && key[1] === 'gen-1') {
        return { taskId: null, status: 'query_failed', queryError: 'DB unavailable' };
      }
      return null;
    });

    const generations = [{ id: 'gen-1' }] as Array<{ id: string }>;
    const result = enhanceGenerationsWithTaskData(
      generations as Parameters<typeof enhanceGenerationsWithTaskData>[0],
      mockQueryClient as unknown as Parameters<typeof enhanceGenerationsWithTaskData>[1],
    );

    expect(result[0].taskId).toBeNull();
    expect(result[0].taskMappingStatus).toBe('query_failed');
    expect(result[0].taskMappingError).toBe('DB unavailable');
  });
});
