import { describe, expect, it, vi } from 'vitest';
import type {
  ManagedOutput,
  Task as RuntimeTask,
} from '@/integrations/runtime/generated.ts';
import {
  exportSelectedRuntimeTaskOutput,
  listAllRuntimeTasks,
  runtimeTaskIsCancellable,
  runtimeTaskIsSelectedTimelineRender,
  runtimeTaskIsRetryable,
  runtimeTaskStatusGroup,
  runtimeTaskTimelineRef,
  runtimeTaskType,
  transitionRuntimeTask,
} from './useRuntimeTasks';

function task(state: RuntimeTask['state'], taskId = `task-${state}`): RuntimeTask {
  return {
    task_id: taskId,
    run_id: `run-${taskId}`,
    project_id: 'runtime-project',
    state,
    version: 4,
    capability_id: 'generation.generate_image',
    capability_digest: 'sha256:capability',
    idempotency_key: `admit:${taskId}`,
    created_at: '2026-09-11T00:00:00Z',
    updated_at: '2026-09-11T00:01:00Z',
    runtime_epoch: 8,
    input_object_ids: ['sha256:input'],
    spec: { family: 'generation.generate_image', params: { prompt: 'test' } },
  };
}

describe('Runtime TasksPane adapter', () => {
  it('follows the canonical project-task cursor and refuses a cursor cycle', async () => {
    const first = task('queued', 'task-1');
    const second = task('running', 'task-2');
    const listProjectTasks = vi.fn()
      .mockResolvedValueOnce({ items: [first], next_cursor: 'cursor-1' })
      .mockResolvedValueOnce({ items: [second], next_cursor: null });

    await expect(listAllRuntimeTasks({ listProjectTasks }, 'runtime-project'))
      .resolves.toEqual([first, second]);
    expect(listProjectTasks).toHaveBeenNthCalledWith(1, 'runtime-project', undefined, 200);
    expect(listProjectTasks).toHaveBeenNthCalledWith(2, 'runtime-project', 'cursor-1', 200);

    const cycleList = vi.fn()
      .mockResolvedValueOnce({ items: [], next_cursor: 'cursor-cycle' })
      .mockResolvedValueOnce({ items: [], next_cursor: 'cursor-cycle' });
    await expect(listAllRuntimeTasks({ listProjectTasks: cycleList }, 'runtime-project'))
      .rejects.toThrow('repeated a cursor');
  });

  it('keeps Runtime state groups and capability/spec identity explicit', () => {
    expect(runtimeTaskStatusGroup(task('queued'))).toBe('Processing');
    expect(runtimeTaskStatusGroup(task('succeeded'))).toBe('Succeeded');
    expect(runtimeTaskStatusGroup(task('failed'))).toBe('Failed');
    expect(runtimeTaskIsCancellable(task('running'))).toBe(true);
    expect(runtimeTaskIsRetryable(task('cancelled'))).toBe(true);
    expect(runtimeTaskType(task('queued'))).toBe('generation.generate_image');
  });

  it('selects a succeeded timeline render and exports its canonical video output', async () => {
    const renderTask = task('succeeded', 'render-task');
    renderTask.capability_id = 'rendering.render';
    renderTask.spec = {
      spec: {
        family: 'rendering.render',
        params: { timeline_ref: 'timeline-1' },
      },
    };
    expect(runtimeTaskTimelineRef(renderTask)).toBe('timeline-1');
    expect(runtimeTaskIsSelectedTimelineRender(renderTask, 'timeline-1')).toBe(true);
    expect(runtimeTaskIsSelectedTimelineRender(renderTask, 'other-timeline')).toBe(false);

    const output: ManagedOutput = {
      association_id: 'managed-output-1',
      project_id: 'runtime-project',
      run_id: renderTask.run_id,
      task_id: renderTask.task_id,
      attempt_id: 'attempt-1',
      output_port: 'video',
      group_key: 'default',
      variant_key: '0',
      selector: { group_key: 'default', variant_key: '0' },
      object_id: 'sha256:object-1',
      digest: 'sha256:object-1',
      manifest_ref: null,
      size: 127059,
      filename: 'timeline-1.mp4',
      media_type: 'video/mp4',
      ordinal: 0,
      role: 'output',
      producer: { capability_id: 'rendering.render' },
      provenance: {
        executor_id: 'astrid-pack-host',
        lease_id: 'lease-1',
        fence: 1,
        runtime_epoch: 10,
      },
      durability: 'durable',
      regeneration: null,
      coverage: null,
      state: 'available',
      version: 1,
      lifecycle: {},
    };
    const client = {
      getTask: vi.fn().mockResolvedValue(renderTask),
      listManagedOutputs: vi.fn().mockResolvedValue({ items: [output], next_cursor: null }),
      exportManagedOutput: vi.fn().mockResolvedValue({ receipt: { receipt_id: 'receipt-1' } }),
    };

    await exportSelectedRuntimeTaskOutput(client, 'runtime-project', renderTask.task_id, 'timeline-1');

    expect(client.listManagedOutputs).toHaveBeenCalledWith(renderTask.task_id, undefined, 50);
    expect(client.exportManagedOutput).toHaveBeenCalledWith(
      'managed-output-1',
      'timeline-1.mp4',
      expect.objectContaining({
        project_id: 'runtime-project',
        task_id: renderTask.task_id,
        association_id: 'managed-output-1',
        object_id: 'sha256:object-1',
        size: 127059,
        executor_id: 'astrid-pack-host',
        lease_id: 'lease-1',
        fence: 1,
        runtime_epoch: 10,
      }),
    );
  });

  it('gets the canonical version before cancel/retry and sends an idempotency key', async () => {
    const current = task('queued', 'task-canonical');
    current.version = 9;
    const client = {
      getTask: vi.fn().mockResolvedValue(current),
      cancelTask: vi.fn().mockResolvedValue({ ...current, state: 'cancelled', receipt: {} }),
      retryTask: vi.fn().mockResolvedValue({ ...current, state: 'retrying', receipt: {} }),
    };

    await transitionRuntimeTask(client, 'runtime-project', {
      taskId: current.task_id,
      action: 'cancel',
    });
    expect(client.getTask).toHaveBeenCalledWith('task-canonical');
    expect(client.cancelTask).toHaveBeenCalledWith(
      'task-canonical',
      'reigh.runtime.task.cancel:runtime-project:task-canonical:v9',
      9,
    );

    await transitionRuntimeTask(client, 'runtime-project', {
      taskId: current.task_id,
      action: 'retry',
    });
    expect(client.retryTask).toHaveBeenCalledWith(
      'task-canonical',
      'reigh.runtime.task.retry:runtime-project:task-canonical:v9',
      9,
    );
  });

  it('refuses a task returned for a different Runtime project', async () => {
    const client = {
      getTask: vi.fn().mockResolvedValue(task('queued')),
      cancelTask: vi.fn(),
      retryTask: vi.fn(),
    };

    await expect(transitionRuntimeTask(client, 'other-project', {
      taskId: 'task-queued',
      action: 'cancel',
    })).rejects.toThrow('not other-project');
    expect(client.cancelTask).not.toHaveBeenCalled();
  });
});
