import { afterEach, describe, expect, it, vi } from 'vitest';

import { readBridgeTaskOutputs } from './bridgeTaskOutputs';
import type { Task } from '@/types/tasks';

afterEach(() => vi.unstubAllGlobals());

describe('readBridgeTaskOutputs', () => {
  it('projects committed output rows to stable R9 media records', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      task_id: 'task-1',
      run_id: 'run-1',
      project_id: 'demo',
      state: 'succeeded',
      version: 1,
      capability_id: 'render_export',
      capability_digest: `sha256:${'a'.repeat(64)}`,
      schema_version: '1',
      input_object_ids: [],
      spec: {
        input_object_ids: [],
        schema_version: '1',
        capability_digest: `sha256:${'a'.repeat(64)}`,
        spec: { family: 'render_export', params: {}, output_policy: {} },
      },
      idempotency_key: 'task-1',
      created_at: '2026-08-24T00:00:00Z',
      updated_at: '2026-08-24T00:01:00Z',
      attempt_id: null,
      runtime_epoch: 1,
      result: {
        outputs: [{
          name: 'video',
          kind: 'object',
          digest: `sha256:${'a'.repeat(64)}`,
          media_type: 'video/mp4',
          size: 42,
        }],
      },
    })));

    const task = {
      id: 'task-1',
      projectId: 'demo',
      taskType: 'render_export',
      status: 'Complete',
      params: {},
      createdAt: '2026-08-24T00:00:00Z',
    } satisfies Task;

    await expect(readBridgeTaskOutputs(task)).resolves.toEqual([
      expect.objectContaining({
        location: `/api/astrid/v1/objects/${encodeURIComponent(`sha256:${'a'.repeat(64)}`)}`,
        type: 'video',
        params: { media_type: 'video/mp4', size: 42 },
        _variant_is_primary: true,
      }),
    ]);
  });
});
