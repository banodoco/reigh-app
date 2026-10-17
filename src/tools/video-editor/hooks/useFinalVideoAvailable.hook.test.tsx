// @vitest-environment jsdom
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ManagedOutput, Task as RuntimeTask } from '@/integrations/runtime/generated.ts';
import { RUNTIME_BASE_URL } from '@/integrations/runtime/client.ts';
import { useFinalVideoAvailable } from './useFinalVideoAvailable.ts';

const mocks = vi.hoisted(() => ({
  task: null as RuntimeTask | null,
  getTask: vi.fn(),
  listManagedOutputs: vi.fn(),
  runtime: null as any,
}));

vi.mock('@/integrations/runtime/client.ts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/integrations/runtime/client.ts')>();
  return {
    ...actual,
    AstridRuntimeClient: class {
      getTask = mocks.getTask;
      listManagedOutputs = mocks.listManagedOutputs;
      objectContentUrl = (id: string) => `/objects/${id}`;
      exportManagedOutput = vi.fn();
    },
  };
});

vi.mock('@/features/tasks/components/TasksPane/hooks/useRuntimeTasks', () => ({
  useRuntimeTasks: () => ({ data: mocks.task ? [mocks.task] : undefined }),
}));
vi.mock('@/shared/hooks/tasks/useBridgeTaskSnapshot.ts', () => ({
  useBridgeTaskSnapshot: () => ({ data: undefined }),
}));
vi.mock('@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx', () => ({
  useVideoEditorRuntime: () => mocks.runtime,
}));

function succeededTask(): RuntimeTask {
  return {
    task_id: 'render-1', run_id: 'run-1', project_id: 'p', state: 'succeeded', version: 1,
    capability_id: 'rendering.render', capability_digest: 'digest', idempotency_key: 'render-1',
    created_at: '2026-10-16T00:00:00Z', updated_at: '2026-10-16T00:00:01Z',
    runtime_epoch: 1, input_object_ids: [],
    spec: { family: 'rendering.render', params: { shot_id: 'shot-1' } },
  } as unknown as RuntimeTask;
}

function videoOutput(): ManagedOutput {
  return {
    association_id: 'association-1', project_id: 'p', run_id: 'run-1', task_id: 'render-1',
    attempt_id: 'attempt-1', output_port: 'video', object_id: `sha256:${'a'.repeat(64)}`,
    digest: `sha256:${'a'.repeat(64)}`, size: 1, filename: 'render.mp4', media_type: 'video/mp4',
    role: 'render', state: 'available',
  } as unknown as ManagedOutput;
}

describe('useFinalVideoAvailable sweep sharing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.task = succeededTask();
    mocks.getTask.mockResolvedValue(succeededTask());
    mocks.listManagedOutputs.mockResolvedValue({ items: [videoOutput()], next_cursor: null });
    mocks.runtime = {
      provider: { apiBaseUrl: RUNTIME_BASE_URL },
      project: { projectId: 'p' },
      userId: 'owner',
      shots: { finalVideoMap: new Map(), dismissFinalVideo: vi.fn() },
      telemetry: { warn: vi.fn() },
    };
  });

  it('runs one Runtime sweep when two mounted consumers load together', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const first = renderHook(() => useFinalVideoAvailable(), { wrapper });
    const second = renderHook(() => useFinalVideoAvailable(), { wrapper });

    await waitFor(() => expect(first.result.current.finalVideoMap.has('shot-1')).toBe(true));
    expect(second.result.current.finalVideoMap.has('shot-1')).toBe(true);
    expect(mocks.getTask).toHaveBeenCalledTimes(1);
    expect(mocks.listManagedOutputs).toHaveBeenCalledTimes(1);

    first.unmount();
    second.unmount();
    queryClient.clear();
  });
});
