import { describe, expect, it } from 'vitest';
import type {
  ManagedOutput,
  Task as RuntimeTask,
  Transport,
} from '@/integrations/runtime/generated.ts';
import { ReighRuntimeClient } from '@/integrations/runtime/client.ts';
import { readRuntimeFinalVideos } from './useFinalVideoAvailable.ts';

const PROJECT_ID = 'project-retained-output';
const TASK_ID = 'task-retained-output';
const TIMELINE_ID = 'timeline-retained-output';
const OBJECT_ID = `sha256:${'a'.repeat(64)}`;
const ASSOCIATION_ID = 'managed-output-retained-output';

function json(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function task(): RuntimeTask {
  return {
    task_id: TASK_ID,
    run_id: 'run-retained-output',
    project_id: PROJECT_ID,
    state: 'succeeded',
    version: 2,
    capability_id: 'rendering.render',
    capability_digest: `sha256:${'b'.repeat(64)}`,
    idempotency_key: 'reigh.render:retained-output',
    created_at: '2026-09-13T00:00:00Z',
    updated_at: '2026-09-13T00:01:00Z',
    attempt_id: 'attempt-retained-output',
    runtime_epoch: 4,
    input_object_ids: [`sha256:${'c'.repeat(64)}`],
    spec: {
      capability_digest: `sha256:${'b'.repeat(64)}`,
      input_object_ids: [`sha256:${'c'.repeat(64)}`],
      schema_version: '1',
      spec: {
        capability_id: 'rendering.render',
        inputs: {
          selector: 'rendering.remotion',
          timeline_ref: TIMELINE_ID,
        },
        kind: 'executor',
        outputs: {},
      },
      storage_estimate: { scratch_bytes: 280879191, output_bytes: 11183776 },
    },
    result: null,
  };
}

function managedOutput(): ManagedOutput {
  return {
    association_id: ASSOCIATION_ID,
    project_id: PROJECT_ID,
    run_id: 'run-retained-output',
    task_id: TASK_ID,
    attempt_id: 'attempt-retained-output',
    output_port: 'video',
    group_key: 'default',
    variant_key: '0',
    selector: { group_key: 'default', variant_key: '0' },
    object_id: OBJECT_ID,
    digest: OBJECT_ID,
    manifest_ref: null,
    size: 133738,
    filename: 'retained-output.mp4',
    media_type: 'video/mp4',
    ordinal: 0,
    role: 'output',
    producer: { capability_id: 'rendering.render' },
    provenance: {
      task_id: TASK_ID,
      attempt_id: 'attempt-retained-output',
      executor_id: 'astrid-pack-host',
      runtime_epoch: 4,
    },
    durability: 'durable',
    state: 'available',
    version: 1,
    lifecycle: { state: 'available', version: 1 },
  };
}

describe('Runtime final-video hydration boundary', () => {
  it('uses canonical task and managed-output routes for retained video identity', async () => {
    const retainedTask = task();
    const retainedOutput = managedOutput();
    const requests: string[] = [];
    const transport: Transport = async (method, path) => {
      requests.push(`${method} ${path}`);
      if (path === '/v1/health') {
        return { status: 200, headers: {}, body: json({ status: 'ok', protocol: 'workspace.v1', schema_digest: 'sha256:test', runtime_epoch: 4 }) };
      }
      if (path === '/v1/handshake') {
        return { status: 200, headers: {}, body: json({ protocol: 'workspace.v1', schema_digest: 'sha256:test', session_id: 'session-retained-output', actor_id: 'owner', realm_id: 'realm-retained-output', scopes: ['handshake', 'tasks:read'] }) };
      }
      if (path === '/v1/realm') {
        return { status: 200, headers: {}, body: json({ realm_id: 'realm-retained-output', display_name: 'Retained output fixture', version: 1, created_at: '2026-09-13T00:00:00Z' }) };
      }
      if (path === `/v1/projects/${PROJECT_ID}/tasks?limit=200`) {
        return { status: 200, headers: {}, body: json({ items: [retainedTask], next_cursor: null }) };
      }
      if (path === `/v1/tasks/${TASK_ID}`) {
        return { status: 200, headers: {}, body: json(retainedTask) };
      }
      if (path === `/v1/tasks/${TASK_ID}/managed-outputs?limit=50`) {
        return { status: 200, headers: {}, body: json({ items: [retainedOutput], next_cursor: null }) };
      }
      throw new Error(`unexpected ${method} ${path}`);
    };

    const client = new ReighRuntimeClient({ baseUrl: '/api/runtime', token: 'fixture-token', transport });
    const videos = await readRuntimeFinalVideos(client, PROJECT_ID);

    expect(videos.get(TIMELINE_ID)).toEqual({
      id: OBJECT_ID,
      location: `/api/runtime/v1/objects/${encodeURIComponent(OBJECT_ID)}`,
      thumbnailUrl: null,
      variantFetchGenerationId: null,
    });
    expect(requests).toEqual([
      'GET /v1/health',
      'POST /v1/handshake',
      'GET /v1/realm',
      `GET /v1/projects/${PROJECT_ID}/tasks?limit=200`,
      `GET /v1/tasks/${TASK_ID}`,
      `GET /v1/tasks/${TASK_ID}/managed-outputs?limit=50`,
    ]);
  });
});
