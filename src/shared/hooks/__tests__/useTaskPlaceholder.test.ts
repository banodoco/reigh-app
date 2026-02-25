import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { extractTaskIds, useTaskPlaceholder } from '../useTaskPlaceholder';

// ---------------------------------------------------------------------------
// extractTaskIds – pure utility, no mocks needed
// ---------------------------------------------------------------------------

describe('extractTaskIds', () => {
  it('returns [] for null/undefined/void', () => {
    expect(extractTaskIds(null)).toEqual([]);
    expect(extractTaskIds(undefined)).toEqual([]);
  });

  it('wraps a single string', () => {
    expect(extractTaskIds('abc-123')).toEqual(['abc-123']);
  });

  it('extracts { task_id } from a single object', () => {
    expect(extractTaskIds({ task_id: 'task-1' })).toEqual(['task-1']);
  });

  it('extracts task_ids from an array of objects', () => {
    const batch = [
      { task_id: 'a' },
      { task_id: 'b' },
      { task_id: 'c' },
    ];
    expect(extractTaskIds(batch)).toEqual(['a', 'b', 'c']);
  });

  it('filters out array items without task_id', () => {
    const mixed = [
      { task_id: 'ok' },
      { other: 'no' },
      null,
      { task_id: 'also-ok' },
    ];
    expect(extractTaskIds(mixed)).toEqual(['ok', 'also-ok']);
  });

  it('extracts IDs from a plain string array', () => {
    expect(extractTaskIds(['id-1', 'id-2', 'id-3'])).toEqual(['id-1', 'id-2', 'id-3']);
  });

  it('handles mixed string and object arrays', () => {
    const mixed = ['id-1', { task_id: 'id-2' }, null, 'id-3'];
    expect(extractTaskIds(mixed)).toEqual(['id-1', 'id-2', 'id-3']);
  });

  it('returns [] for unrecognized shapes', () => {
    expect(extractTaskIds(42)).toEqual([]);
    expect(extractTaskIds({ id: 'not-task-id' })).toEqual([]);
    expect(extractTaskIds(true)).toEqual([]);
  });

  it('returns [] for empty array', () => {
    expect(extractTaskIds([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// useTaskPlaceholder – integration test with mocked context
// ---------------------------------------------------------------------------

const mockAddIncomingTask = vi.fn(() => 'incoming-1');
const mockRemoveIncomingTask = vi.fn();
const mockResolveTaskIds = vi.fn();
const mockWasCancelled = vi.fn(() => false);
const mockAcknowledgeCancellation = vi.fn();
const mockRefetchQueries = vi.fn(() => Promise.resolve());

vi.mock('@/shared/contexts/IncomingTasksContext', () => ({
  useIncomingTasks: () => ({
    addIncomingTask: mockAddIncomingTask,
    removeIncomingTask: mockRemoveIncomingTask,
    resolveTaskIds: mockResolveTaskIds,
    wasCancelled: mockWasCancelled,
    acknowledgeCancellation: mockAcknowledgeCancellation,
    cancelIncoming: vi.fn(),
    cancelAllIncoming: vi.fn(),
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    refetchQueries: mockRefetchQueries,
  }),
}));

const mockSupabaseUpdate = vi.fn(() => ({ in: vi.fn(() => Promise.resolve({ error: null })) }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({ update: mockSupabaseUpdate }),
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

describe('useTaskPlaceholder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs full lifecycle on success', async () => {
    const { result } = renderHook(() => useTaskPlaceholder());

    await act(async () => {
      await result.current({
        taskType: 'image-upscale',
        label: 'Upscale 2x',
        context: 'test',
        toastTitle: 'Failed',
        create: async () => ({ task_id: 'real-task-1' }),
      });
    });

    // 1. addIncomingTask called
    expect(mockAddIncomingTask).toHaveBeenCalledWith({
      taskType: 'image-upscale',
      label: 'Upscale 2x',
      expectedCount: undefined,
    });

    // 2. resolveTaskIds called with extracted ID
    expect(mockResolveTaskIds).toHaveBeenCalledWith('incoming-1', ['real-task-1']);

    // 3. refetch called in finally
    expect(mockRefetchQueries).toHaveBeenCalledTimes(2);

    // 4. removeIncomingTask called in finally
    expect(mockRemoveIncomingTask).toHaveBeenCalledWith('incoming-1');
  });

  it('still cleans up on error', async () => {
    const { result } = renderHook(() => useTaskPlaceholder());

    await act(async () => {
      await result.current({
        taskType: 'image-upscale',
        label: 'Upscale 2x',
        context: 'test',
        toastTitle: 'Failed',
        create: async () => {
          throw new Error('boom');
        },
      });
    });

    // resolveTaskIds should NOT be called
    expect(mockResolveTaskIds).not.toHaveBeenCalled();

    // cleanup still happens
    expect(mockRefetchQueries).toHaveBeenCalledTimes(2);
    expect(mockRemoveIncomingTask).toHaveBeenCalledWith('incoming-1');
  });

  it('calls onSuccess with extracted task IDs', async () => {
    const onSuccess = vi.fn();
    const { result } = renderHook(() => useTaskPlaceholder());

    await act(async () => {
      await result.current({
        taskType: 'test',
        label: 'test',
        context: 'test',
        toastTitle: 'Failed',
        create: async () => [{ task_id: 'a' }, { task_id: 'b' }],
        onSuccess,
      });
    });

    expect(onSuccess).toHaveBeenCalledWith(['a', 'b']);
    expect(mockResolveTaskIds).toHaveBeenCalledWith('incoming-1', ['a', 'b']);
  });

  it('skips resolveTaskIds when create returns void', async () => {
    const { result } = renderHook(() => useTaskPlaceholder());

    await act(async () => {
      await result.current({
        taskType: 'test',
        label: 'test',
        context: 'test',
        toastTitle: 'Failed',
        create: async () => undefined,
      });
    });

    expect(mockResolveTaskIds).not.toHaveBeenCalled();
    expect(mockRemoveIncomingTask).toHaveBeenCalledWith('incoming-1');
  });

  it('passes expectedCount through to addIncomingTask', async () => {
    const { result } = renderHook(() => useTaskPlaceholder());

    await act(async () => {
      await result.current({
        taskType: 'image_generation',
        label: 'Generate 4 images',
        expectedCount: 4,
        context: 'test',
        toastTitle: 'Failed',
        create: async () => null,
      });
    });

    expect(mockAddIncomingTask).toHaveBeenCalledWith({
      taskType: 'image_generation',
      label: 'Generate 4 images',
      expectedCount: 4,
    });
  });
});
