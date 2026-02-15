import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const mockCreateBatchImageGenerationTasks = vi.fn();
const mockGetApiKey = vi.fn();
const mockAddIncomingTask = vi.fn().mockReturnValue('incoming-1');
const mockRemoveIncomingTask = vi.fn();
const mockHandleError = vi.fn();
const mockToastError = vi.fn();

vi.mock('@/shared/lib/tasks/imageGeneration', () => ({
  createBatchImageGenerationTasks: (...args: unknown[]) => mockCreateBatchImageGenerationTasks(...args),
}));

vi.mock('@/shared/hooks/useApiKeys', () => ({
  useApiKeys: () => ({
    getApiKey: mockGetApiKey,
  }),
}));

vi.mock('@/shared/contexts/IncomingTasksContext', () => ({
  useIncomingTasks: () => ({
    addIncomingTask: mockAddIncomingTask,
    removeIncomingTask: mockRemoveIncomingTask,
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

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: (...args: unknown[]) => mockHandleError(...args),
}));

vi.mock('@/shared/components/ui/sonner', () => ({
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
    mockCreateBatchImageGenerationTasks.mockResolvedValue([
      { task_id: 'task-1' },
      { task_id: 'task-2' },
    ]);
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
      prompts: [{ text: 'a beautiful landscape' }],
      project_id: 'proj-1',
    };

    let taskIds: string[] = [];
    await act(async () => {
      taskIds = await result.current.handleNewGenerate(taskParams as any);
    });

    expect(taskIds).toEqual(['task-1', 'task-2']);
    expect(mockCreateBatchImageGenerationTasks).toHaveBeenCalledWith(taskParams);
  });

  it('adds incoming task before creating tasks', async () => {
    const { result } = renderHook(
      () => useImageGenSubmit({ projectId: 'proj-1', effectiveProjectId: 'proj-1' }),
      { wrapper: createWrapper() },
    );

    const taskParams = {
      prompts: [{ text: 'a beautiful landscape' }],
      project_id: 'proj-1',
    };

    await act(async () => {
      await result.current.handleNewGenerate(taskParams as any);
    });

    expect(mockAddIncomingTask).toHaveBeenCalledWith({
      taskType: 'image_generation',
      label: 'a beautiful landscape',
    });
  });

  it('truncates label to 50 chars', async () => {
    const { result } = renderHook(
      () => useImageGenSubmit({ projectId: 'proj-1', effectiveProjectId: 'proj-1' }),
      { wrapper: createWrapper() },
    );

    const longPrompt = 'a'.repeat(100);
    const taskParams = {
      prompts: [{ text: longPrompt }],
      project_id: 'proj-1',
    };

    await act(async () => {
      await result.current.handleNewGenerate(taskParams as any);
    });

    expect(mockAddIncomingTask).toHaveBeenCalledWith({
      taskType: 'image_generation',
      label: longPrompt.substring(0, 50),
    });
  });

  it('removes incoming task in finally block', async () => {
    const { result } = renderHook(
      () => useImageGenSubmit({ projectId: 'proj-1', effectiveProjectId: 'proj-1' }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.handleNewGenerate({ prompts: [{ text: 'test' }] } as any);
    });

    expect(mockRemoveIncomingTask).toHaveBeenCalledWith('incoming-1');
  });

  it('shows toast error and returns empty array when projectId is null', async () => {
    const { result } = renderHook(
      () => useImageGenSubmit({ projectId: null, effectiveProjectId: null }),
      { wrapper: createWrapper() },
    );

    let taskIds: string[] = [];
    await act(async () => {
      taskIds = await result.current.handleNewGenerate({ prompts: [{ text: 'test' }] } as any);
    });

    expect(taskIds).toEqual([]);
    expect(mockToastError).toHaveBeenCalledWith(
      expect.stringContaining('No project selected'),
    );
  });

  it('handles createBatchImageGenerationTasks error', async () => {
    mockCreateBatchImageGenerationTasks.mockRejectedValue(new Error('API error'));

    const { result } = renderHook(
      () => useImageGenSubmit({ projectId: 'proj-1', effectiveProjectId: 'proj-1' }),
      { wrapper: createWrapper() },
    );

    let taskIds: string[] = [];
    await act(async () => {
      taskIds = await result.current.handleNewGenerate({ prompts: [{ text: 'test' }] } as any);
    });

    expect(taskIds).toEqual([]);
    expect(mockHandleError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'ImageGenerationToolPage.handleNewGenerate',
      }),
    );
  });

  it('removes incoming task even on error', async () => {
    mockCreateBatchImageGenerationTasks.mockRejectedValue(new Error('fail'));

    const { result } = renderHook(
      () => useImageGenSubmit({ projectId: 'proj-1', effectiveProjectId: 'proj-1' }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.handleNewGenerate({ prompts: [{ text: 'test' }] } as any);
    });

    expect(mockRemoveIncomingTask).toHaveBeenCalledWith('incoming-1');
  });

  it('uses fallback label when prompts are empty', async () => {
    const { result } = renderHook(
      () => useImageGenSubmit({ projectId: 'proj-1', effectiveProjectId: 'proj-1' }),
      { wrapper: createWrapper() },
    );

    await act(async () => {
      await result.current.handleNewGenerate({ prompts: [] } as any);
    });

    expect(mockAddIncomingTask).toHaveBeenCalledWith({
      taskType: 'image_generation',
      label: 'Generating images...',
    });
  });
});
