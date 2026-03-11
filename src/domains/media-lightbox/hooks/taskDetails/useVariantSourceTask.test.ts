// @vitest-environment jsdom

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchTaskInProject: vi.fn(),
  taskQuerySingle: vi.fn(),
  getSourceTaskIdLegacyCompatible: vi.fn(),
  hasOrchestratorDetails: vi.fn(),
}));

vi.mock('@/integrations/supabase/repositories/taskRepository', () => ({
  fetchTaskInProject: (...args: unknown[]) => mocks.fetchTaskInProject(...args),
}));

vi.mock('@/shared/lib/queryKeys/tasks', () => ({
  taskQueryKeys: {
    single: (...args: unknown[]) => mocks.taskQuerySingle(...args),
  },
}));

vi.mock('@/shared/lib/taskIdHelpers', () => ({
  getSourceTaskIdLegacyCompatible: (...args: unknown[]) =>
    mocks.getSourceTaskIdLegacyCompatible(...args),
  hasOrchestratorDetails: (...args: unknown[]) => mocks.hasOrchestratorDetails(...args),
}));

import { useVariantSourceTask } from './useVariantSourceTask';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
}

describe('useVariantSourceTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.taskQuerySingle.mockImplementation((taskId: string, projectId: string | null) => [
      'tasks',
      taskId,
      projectId,
    ]);
    mocks.getSourceTaskIdLegacyCompatible.mockImplementation(
      (params: Record<string, unknown> | undefined) =>
        typeof params?.source_task_id === 'string' ? params.source_task_id : undefined,
    );
    mocks.hasOrchestratorDetails.mockImplementation(
      (params: Record<string, unknown> | undefined) => Boolean(params?.orchestrator_details),
    );
  });

  it('fetches the source task when the active variant references a different task', async () => {
    mocks.fetchTaskInProject.mockResolvedValueOnce({
      id: 'source-task',
      params: { input_image: 'from-source-task.png' },
    });

    const { result } = renderHook(
      () =>
        useVariantSourceTask({
          projectId: 'project-1',
          activeVariant: { params: { source_task_id: 'source-task' } },
          taskDetailsData: { taskId: 'other-task' } as never,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.variantSourceTask).toEqual({
        id: 'source-task',
        params: { input_image: 'from-source-task.png' },
      });
    });

    expect(result.current.variantSourceTaskId).toBe('source-task');
    expect(result.current.variantHasOrchestratorDetails).toBe(false);
    expect(mocks.fetchTaskInProject).toHaveBeenCalledWith('source-task', 'project-1');
  });

  it('normalizes non-Error query failures into Error instances', async () => {
    mocks.fetchTaskInProject.mockRejectedValueOnce({ message: 'fetch failed' });

    const { result } = renderHook(
      () =>
        useVariantSourceTask({
          projectId: 'project-1',
          activeVariant: { params: { source_task_id: 'source-task' } },
          taskDetailsData: undefined,
        }),
      { wrapper: createWrapper() },
    );

    await waitFor(() => {
      expect(result.current.variantSourceTaskError?.message).toBe('fetch failed');
    });
  });

  it('skips fetching when orchestrator details already exist on the variant', () => {
    const { result } = renderHook(
      () =>
        useVariantSourceTask({
          projectId: 'project-1',
          activeVariant: {
            params: {
              source_task_id: 'source-task',
              orchestrator_details: { step: 'already-present' },
            },
          },
          taskDetailsData: { taskId: 'other-task' } as never,
        }),
      { wrapper: createWrapper() },
    );

    expect(result.current.variantSourceTaskId).toBe('source-task');
    expect(result.current.variantHasOrchestratorDetails).toBe(true);
    expect(mocks.fetchTaskInProject).not.toHaveBeenCalled();
  });
});
