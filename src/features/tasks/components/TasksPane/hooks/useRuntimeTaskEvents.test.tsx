import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AstridRuntimeClient } from '@/integrations/runtime/client.ts';
import type { Event as RuntimeEvent, Task as RuntimeTask } from '@/integrations/runtime/generated.ts';
import { runtimeTaskQueryKey, useRuntimeTaskEvents } from './useRuntimeTaskEvents';

const task = (id: string, projectId = 'project-a', version = 1): RuntimeTask => ({
  task_id: id, project_id: projectId, state: 'running', version,
  run_id: `run-${id}`, capability_id: 'generation.generate_image',
  capability_digest: 'sha256:capability', idempotency_key: `admit:${id}`,
  created_at: '2026-10-16T00:00:00Z', updated_at: '2026-10-16T00:01:00Z',
  runtime_epoch: 1, input_object_ids: [], spec: {},
});

const event = (id: string, eventType = 'task.progress'): RuntimeEvent => ({
  event_id: `event-${id}`, sequence: 1, cursor: `cursor-${id}`,
  event_type: eventType, aggregate_type: 'task', aggregate_id: id,
  payload: {}, occurred_at: '2026-10-16T00:01:00Z',
});

const page = (items: RuntimeEvent[], nextCursor: string) => ({
  items, next_cursor: nextCursor,
});

function wrapper(queryClient: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => React.createElement(
    QueryClientProvider, { client: queryClient }, children,
  );
}

async function advance(ms: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}

describe('useRuntimeTaskEvents', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('shares one cursor, starts from latest, and upserts an external task within a visible tick', async () => {
    const listEvents = vi.spyOn(AstridRuntimeClient.prototype, 'listEvents')
      .mockResolvedValueOnce(page([], 'cursor-0'))
      .mockResolvedValueOnce(page([event('external')], 'cursor-1'))
      .mockResolvedValue(page([], 'cursor-1'));
    const getTask = vi.spyOn(AstridRuntimeClient.prototype, 'getTask')
      .mockResolvedValue(task('external'));
    const queryClient = new QueryClient();
    queryClient.setQueryData(runtimeTaskQueryKey('project-a'), []);
    const first = renderHook(() => useRuntimeTaskEvents('project-a'), { wrapper: wrapper(queryClient) });
    const second = renderHook(() => useRuntimeTaskEvents('project-a'), { wrapper: wrapper(queryClient) });

    await advance(0);
    expect(listEvents).toHaveBeenCalledTimes(1);
    expect(listEvents).toHaveBeenNthCalledWith(1, undefined, true);
    await advance(2_000);
    expect(listEvents).toHaveBeenNthCalledWith(2, 'cursor-0', false);
    expect(getTask).not.toHaveBeenCalled();
    await advance(300);
    expect(getTask).toHaveBeenCalledOnce();
    expect(queryClient.getQueryData(runtimeTaskQueryKey('project-a'))).toEqual([task('external')]);

    first.unmount();
    await advance(2_000);
    expect(listEvents).toHaveBeenCalledTimes(3);
    second.unmount();
    queryClient.clear();
  });

  it('drains event pages, deduplicates progress, and filters fetched tasks by project', async () => {
    const fullPage = Array.from({ length: 50 }, () => event('current'));
    const listEvents = vi.spyOn(AstridRuntimeClient.prototype, 'listEvents')
      .mockResolvedValueOnce(page([], 'cursor-0'))
      .mockResolvedValueOnce(page(fullPage, 'cursor-50'))
      .mockResolvedValueOnce(page([event('foreign'), {
        ...event('run-only'), aggregate_type: 'run', event_type: 'run.completed',
      }], 'cursor-52'));
    const progressed = {
      ...task('current', 'project-a', 2),
      progress: { phase: 'Generating', percent: 80 },
    };
    const getTask = vi.spyOn(AstridRuntimeClient.prototype, 'getTask')
      .mockImplementation(async (id) => id === 'foreign' ? task(id, 'project-b') : progressed);
    const queryClient = new QueryClient();
    queryClient.setQueryData(runtimeTaskQueryKey('project-a'), [task('current')]);
    const hook = renderHook(() => useRuntimeTaskEvents('project-a'), { wrapper: wrapper(queryClient) });

    await advance(0);
    await advance(2_000);
    expect(listEvents).toHaveBeenNthCalledWith(3, 'cursor-50', false);
    await advance(300);
    expect(getTask).toHaveBeenCalledTimes(2);
    expect(queryClient.getQueryData(runtimeTaskQueryKey('project-a'))).toEqual([progressed]);

    hook.unmount();
    queryClient.clear();
  });

  it('uses a fifteen-second event cadence while hidden', async () => {
    let visibility: DocumentVisibilityState = 'visible';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => visibility);
    const listEvents = vi.spyOn(AstridRuntimeClient.prototype, 'listEvents')
      .mockResolvedValue(page([], 'cursor-0'));
    const queryClient = new QueryClient();
    const hook = renderHook(() => useRuntimeTaskEvents('project-a'), { wrapper: wrapper(queryClient) });

    await advance(0);
    visibility = 'hidden';
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    await advance(14_999);
    expect(listEvents).toHaveBeenCalledTimes(1);
    await advance(1);
    expect(listEvents).toHaveBeenCalledTimes(2);

    hook.unmount();
    queryClient.clear();
  });
});
