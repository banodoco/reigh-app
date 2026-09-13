import { describe, expect, it } from 'vitest';
import type { Task as RuntimeTask } from '@/integrations/runtime/generated.ts';
import { selectActiveRuntimeTasks } from './useActiveTaskClips.ts';

function task(state: RuntimeTask['state'], taskId: string): RuntimeTask {
  return {
    task_id: taskId,
    run_id: `run-${taskId}`,
    project_id: 'runtime-project',
    state,
    version: 2,
    capability_id: 'rendering.render',
    capability_digest: 'sha256:capability',
    idempotency_key: `admit:${taskId}`,
    created_at: '2026-09-13T00:00:00Z',
    updated_at: '2026-09-13T00:01:00Z',
    attempt_id: null,
    runtime_epoch: 4,
    input_object_ids: ['sha256:input'],
    spec: {
      capability_id: 'rendering.render',
      spec: {
        inputs: {
          generation_id: 'generation-active',
        },
      },
    },
    result: null,
  };
}

describe('Runtime active-task clip boundary', () => {
  it('maps only queued/running canonical Runtime tasks to existing generation references', () => {
    expect(selectActiveRuntimeTasks([
      task('queued', 'queued-task'),
      task('running', 'running-task'),
      task('succeeded', 'succeeded-task'),
      task('failed', 'failed-task'),
    ])).toEqual([
      {
        id: 'queued-task',
        status: 'queued',
        task_type: 'rendering.render',
        params: { generation_id: 'generation-active' },
      },
      {
        id: 'running-task',
        status: 'running',
        task_type: 'rendering.render',
        params: { generation_id: 'generation-active' },
      },
    ]);
  });
});
