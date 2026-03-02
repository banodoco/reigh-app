import { describe, it, expect, vi, beforeEach } from 'vitest';
import { waitFor } from '@testing-library/react';
import { renderHookWithProviders } from '@/test/test-utils';

const mockUseTaskFromUnifiedCache = vi.fn();
const mockUseGetTask = vi.fn();
const mockMutateAsync = vi.fn();
const mockNormalizeAndPresentError = vi.fn();
const mockPrimaryTaskLookup = {
  mutateAsync: mockMutateAsync,
  isPending: false,
};

vi.mock('@/shared/hooks/useTaskPrefetch', () => ({
  useTaskFromUnifiedCache: (...args: unknown[]) => mockUseTaskFromUnifiedCache(...args),
}));

vi.mock('@/shared/hooks/useTasks', () => ({
  useGetTask: (...args: unknown[]) => mockUseGetTask(...args),
}));

vi.mock('@/shared/lib/generationTaskBridge', () => ({
  useGetPrimaryTaskIdForGeneration: () => mockPrimaryTaskLookup,
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mockNormalizeAndPresentError(...args),
}));

import { useGenerationTaskDetails } from '../useGenerationTaskDetails';

describe('useGenerationTaskDetails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrimaryTaskLookup.isPending = false;
    mockUseTaskFromUnifiedCache.mockReturnValue({
      data: { taskId: 'task-1', status: 'ok' },
      isLoading: false,
    });
    mockUseGetTask.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    });
    mockMutateAsync.mockResolvedValue({ status: 'ok', taskId: null });
  });

  it('derives input images via the shared params parser', () => {
    mockUseGetTask.mockReturnValue({
      data: {
        id: 'task-1',
        params: '{"input_images":["https://example.com/a.png","https://example.com/b.png"]}',
      },
      isLoading: false,
      error: null,
    });

    const { result } = renderHookWithProviders(() => useGenerationTaskDetails({
      generationId: 'gen-1',
      enabled: true,
    }));

    expect(result.current.inputImages).toEqual([
      'https://example.com/a.png',
      'https://example.com/b.png',
    ]);
  });

  it('returns empty input images for malformed params payloads', () => {
    mockUseGetTask.mockReturnValue({
      data: {
        id: 'task-1',
        params: '{not-json',
      },
      isLoading: false,
      error: null,
    });

    const { result } = renderHookWithProviders(() => useGenerationTaskDetails({
      generationId: 'gen-1',
      enabled: true,
    }));

    expect(result.current.inputImages).toEqual([]);
  });

  it('does not trigger fallback mapping when cache status is query_failed', async () => {
    mockUseTaskFromUnifiedCache.mockReturnValue({
      data: { taskId: null, status: 'query_failed', queryError: 'RPC failed' },
      isLoading: false,
    });

    const { result } = renderHookWithProviders(() => useGenerationTaskDetails({
      generationId: 'gen-1',
      enabled: true,
      resolveMappingOnDemand: true,
    }));

    await waitFor(() => {
      expect(result.current.taskId).toBeNull();
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it('uses fallback mapping when cache has no task id', async () => {
    mockUseTaskFromUnifiedCache.mockReturnValue({
      data: { taskId: null, status: 'not_loaded' },
      isLoading: false,
    });
    mockMutateAsync.mockImplementation(async () => {
      mockUseTaskFromUnifiedCache.mockReturnValue({
        data: { taskId: 'fallback-task', status: 'ok' },
        isLoading: false,
      });
      return { status: 'ok', taskId: 'fallback-task' };
    });
    mockUseGetTask.mockImplementation((taskId: string) => ({
      data: taskId === 'fallback-task' ? { id: 'fallback-task', params: {} } : undefined,
      isLoading: false,
      error: null,
    }));

    const { result } = renderHookWithProviders(() => useGenerationTaskDetails({
      generationId: 'gen-1',
      enabled: true,
      resolveMappingOnDemand: true,
    }));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith('gen-1');
    });
    await waitFor(() => {
      expect(result.current.taskId).toBe('fallback-task');
    });
  });
});
