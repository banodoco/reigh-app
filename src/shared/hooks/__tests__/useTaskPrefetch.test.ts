import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

const mockMaybeSingle = vi.fn();
const mockSingle = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: mockMaybeSingle,
          single: mockSingle,
        })),
      })),
    })),
  },
}));

vi.mock('../useTasks', () => ({
  mapDbTaskToTask: vi.fn((data: unknown) => ({ ...data as object, _mapped: true })),
}));

import { useTaskFromUnifiedCache, usePrefetchTaskData, usePrefetchTaskById } from '../useTaskPrefetch';

describe('useTaskFromUnifiedCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({ data: { tasks: ['task-1'] }, error: null });
  });

  it('is disabled when generationId is empty', () => {
    const { result } = renderHookWithProviders(() => useTaskFromUnifiedCache(''));
    expect(result.current.isFetching).toBe(false);
  });

  it('returns taskId from generation data', async () => {
    const { result } = renderHookWithProviders(() => useTaskFromUnifiedCache('gen-1'));

    await vi.waitFor(() => {
      expect(result.current.data).toEqual({ taskId: 'task-1' });
    });
  });

  it('returns null taskId when generation has no tasks', async () => {
    mockMaybeSingle.mockResolvedValue({ data: { tasks: [] }, error: null });

    const { result } = renderHookWithProviders(() => useTaskFromUnifiedCache('gen-1'));

    await vi.waitFor(() => {
      expect(result.current.data).toEqual({ taskId: null });
    });
  });

  it('returns null taskId when generation not found', async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const { result } = renderHookWithProviders(() => useTaskFromUnifiedCache('gen-missing'));

    await vi.waitFor(() => {
      expect(result.current.data).toEqual({ taskId: null });
    });
  });
});

describe('usePrefetchTaskData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({ data: { tasks: ['task-1'] }, error: null });
    mockSingle.mockResolvedValue({ data: { id: 'task-1', status: 'Completed' }, error: null });
  });

  it('returns a prefetch function', () => {
    const { result } = renderHookWithProviders(() => usePrefetchTaskData());
    expect(typeof result.current).toBe('function');
  });

  it('does nothing for empty generationId', async () => {
    const { result } = renderHookWithProviders(() => usePrefetchTaskData());

    await act(async () => {
      await result.current('');
    });

    expect(mockMaybeSingle).not.toHaveBeenCalled();
  });
});

describe('usePrefetchTaskById', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { id: 'task-1', status: 'Completed' }, error: null });
  });

  it('returns a prefetch function', () => {
    const { result } = renderHookWithProviders(() => usePrefetchTaskById());
    expect(typeof result.current).toBe('function');
  });

  it('does nothing for empty taskId', async () => {
    const { result } = renderHookWithProviders(() => usePrefetchTaskById());

    await act(async () => {
      await result.current('');
    });

    expect(mockSingle).not.toHaveBeenCalled();
  });
});
