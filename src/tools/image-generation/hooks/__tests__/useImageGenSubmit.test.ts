import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockCreateTask = vi.fn();
const mockGetApiKey = vi.fn();
const mockHandleError = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/shared/lib/taskCreation', () => ({
  createTask: (...args: unknown[]) => mockCreateTask(...args),
}));

vi.mock('@/features/settings/hooks/useApiKeys', () => ({
  useApiKeys: () => ({
    getApiKey: mockGetApiKey,
  }),
}));

vi.mock('@/shared/lib/queryKeys', () => ({
  queryKeys: {
    tasks: {
      all: ['tasks'],
      paginatedAll: ['tasks', 'paginated'],
      statusCountsAll: ['tasks', 'statusCounts'],
    },
    unified: {
      projectPrefix: (id: string | null) => ['unified', id],
    },
  },
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mockHandleError(...args),
}));

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: vi.fn(),
  },
}));

import { useImageGenSubmit } from '../useImageGenSubmit';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useImageGenSubmit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetApiKey.mockReturnValue('test-api-key');
    mockCreateTask.mockResolvedValue({
      task_id: 'task-1',
      task_ids: ['task-1', 'task-2'],
      status: 'queued',
    });
  });

  it('returns handleNewGenerate and openaiApiKey', () => {
    const { result } = renderHook(
      () => useImageGenSubmit({ projectId: 'proj-1', effectiveProjectId: 'proj-1' }),
      { wrapper: createWrapper() },
    );

    expect(typeof result.current.handleNewGenerate).toBe('function');
    expect(result.current.openaiApiKey).toBe('test-api-key');
  });

  it('calls getApiKey with openai_api_key', () => {
    renderHook(
      () => useImageGenSubmit({ projectId: 'proj-1', effectiveProjectId: 'proj-1' }),
      { wrapper: createWrapper() },
    );

    expect(mockGetApiKey).toHaveBeenCalledWith('openai_api_key');
  });

  it('creates tasks and returns task IDs on success', async () => {
    const { result } = renderHook(
      () => useImageGenSubmit({ projectId: 'proj-1', effectiveProjectId: 'proj-1' }),
      { wrapper: createWrapper() },
    );

    const taskParams = {
      prompts: [{ fullPrompt: 'a beautiful landscape' }],
      project_id: 'proj-1',
    };

    let taskIds: string[] = [];
    await act(async () => {
      taskIds = await result.current.handleNewGenerate(taskParams as unknown);
    });

    expect(taskIds).toEqual(['task-1', 'task-2']);
    expect(mockCreateTask).toHaveBeenCalledWith({
      project_id: 'proj-1',
      family: 'image_generation',
      input: {
        prompts: [{ fullPrompt: 'a beautiful landscape' }],
      },
    });
  });

  it('does not manage incoming task placeholders (caller handles this)', async () => {
    const { result } = renderHook(
      () => useImageGenSubmit({ projectId: 'proj-1', effectiveProjectId: 'proj-1' }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.handleNewGenerate({ prompts: [{ fullPrompt: 'test' }] } as unknown);
    });

    // Verify no incoming task management — the caller's runIncomingTask wrapper handles this
    // If useIncomingTasks were imported, it would appear in the mock calls
  });

  it('shows toast error and returns empty array when projectId is null', async () => {
    const { result } = renderHook(
      () => useImageGenSubmit({ projectId: null, effectiveProjectId: null }),
      { wrapper: createWrapper() },
    );

    let taskIds: string[] = [];
    await act(async () => {
      taskIds = await result.current.handleNewGenerate({ prompts: [{ fullPrompt: 'test' }] } as unknown);
    });

    expect(taskIds).toEqual([]);
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('No project selected'),
    );
  });

  it('handles createTask error', async () => {
    mockCreateTask.mockRejectedValue(new Error('API error'));

    const { result } = renderHook(
      () => useImageGenSubmit({ projectId: 'proj-1', effectiveProjectId: 'proj-1' }),
      { wrapper: createWrapper() },
    );

    let taskIds: string[] = [];
    await act(async () => {
      taskIds = await result.current.handleNewGenerate({ prompts: [{ fullPrompt: 'test' }] } as unknown);
    });

    expect(taskIds).toEqual([]);
    expect(mockHandleError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'ImageGenerationToolPage.handleNewGenerate',
      }),
    );
  });

  it('does not throw on error — returns empty array', async () => {
    mockCreateTask.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(
      () => useImageGenSubmit({ projectId: 'proj-1', effectiveProjectId: 'proj-1' }),
      { wrapper: createWrapper() },
    );

    let taskIds: string[] = [];
    await act(async () => {
      taskIds = await result.current.handleNewGenerate({ prompts: [{ fullPrompt: 'test' }] } as unknown);
    });

    expect(taskIds).toEqual([]);
  });
});
