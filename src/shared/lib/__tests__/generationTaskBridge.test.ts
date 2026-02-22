import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockSupabase } = vi.hoisted(() => {
  const mockSupabase = {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn(),
  };
  return { mockSupabase };
});

vi.mock('@/integrations/supabase/client', () => ({
  supabase: mockSupabase,
}));

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((options: unknown) => ({
    mutate: vi.fn(),
    mutateAsync: vi.fn(),
    ...options,
  })),
  QueryClient: vi.fn(),
}));

vi.mock('@/shared/lib/queryKeys/tasks', () => ({
  taskQueryKeys: {
    all: ['tasks'],
    generationMapping: (id: string) => ['generation-task-mapping', id],
    single: (id: string) => ['tasks', 'single', id],
  },
}));

vi.mock('@/shared/lib/errorHandling/handleError', () => ({
  handleError: vi.fn(),
}));

import {
  preloadGenerationTaskMappings,
  enhanceGenerationsWithTaskData,
} from '../generationTaskBridge';

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
    mockSupabase.in.mockResolvedValue({
      data: [
        { id: 'gen-1', tasks: ['task-1'] },
        { id: 'gen-2', tasks: ['task-2'] },
      ],
      error: null,
    });
  });

  it('does nothing for empty generation IDs', async () => {
    await preloadGenerationTaskMappings([], mockQueryClient as unknown);
    expect(mockSupabase.from).not.toHaveBeenCalled();
  });

  it('fetches and caches task mappings', async () => {
    await preloadGenerationTaskMappings(['gen-1', 'gen-2'], mockQueryClient as unknown);

    expect(mockQueryClient.setQueryData).toHaveBeenCalledTimes(2);
    expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
      ['generation-task-mapping', 'gen-1'],
      { taskId: 'task-1' }
    );
    expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
      ['generation-task-mapping', 'gen-2'],
      { taskId: 'task-2' }
    );
  });

  it('handles generations with no tasks', async () => {
    mockSupabase.in.mockResolvedValue({
      data: [{ id: 'gen-1', tasks: null }],
      error: null,
    });

    await preloadGenerationTaskMappings(['gen-1'], mockQueryClient as unknown);

    expect(mockQueryClient.setQueryData).toHaveBeenCalledWith(
      ['generation-task-mapping', 'gen-1'],
      { taskId: null }
    );
  });

  it('handles errors gracefully', async () => {
    mockSupabase.in.mockResolvedValue({
      data: null,
      error: new Error('DB error'),
    });

    // Should not throw
    await expect(
      preloadGenerationTaskMappings(['gen-1'], mockQueryClient as unknown)
    ).resolves.not.toThrow();
  });

  it('batches requests according to batchSize', async () => {
    const ids = Array.from({ length: 12 }, (_, i) => `gen-${i}`);

    await preloadGenerationTaskMappings(ids, mockQueryClient as unknown, {
      batchSize: 5,
      delayBetweenBatches: 0,
    });

    // Should have made 3 batch calls (5 + 5 + 2)
    expect(mockSupabase.in).toHaveBeenCalledTimes(3);
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
        return { taskId: 'task-1' };
      }
      if (key[0] === 'tasks' && key[1] === 'single' && key[2] === 'task-1') {
        return { id: 'task-1' };
      }
      return null;
    });

    const generations = [{ id: 'gen-1' }] as unknown[];
    const result = enhanceGenerationsWithTaskData(generations, mockQueryClient as unknown);

    expect(result[0].taskId).toBe('task-1');
  });

  it('returns null taskId when not cached', () => {
    mockQueryClient.getQueryData.mockReturnValue(undefined);

    const generations = [{ id: 'gen-1' }] as unknown[];
    const result = enhanceGenerationsWithTaskData(generations, mockQueryClient as unknown);

    expect(result[0].taskId).toBeNull();
  });

  it('preserves original generation data', () => {
    mockQueryClient.getQueryData.mockReturnValue(undefined);

    const generations = [{ id: 'gen-1', type: 'video', location: '/path.mp4' }] as unknown[];
    const result = enhanceGenerationsWithTaskData(generations, mockQueryClient as unknown);

    expect(result[0].id).toBe('gen-1');
    expect(result[0].type).toBe('video');
    expect(result[0].location).toBe('/path.mp4');
  });
});
