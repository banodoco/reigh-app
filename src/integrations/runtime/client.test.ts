import { describe, expect, it } from 'vitest';
import type { Transport } from './generated.ts';
import { ReighRuntimeClient } from './client.ts';

const PROJECT_ID = 'project/r2';
const CAPABILITY_ID = 'astrid.image_generation';
const CAPABILITY_DIGEST = `sha256:${'a'.repeat(64)}`;
const INPUT_OBJECT_ID = `sha256:${'1'.repeat(64)}`;
const MEDIA_OBJECT_ID = 'object-r4-media';
const MEDIA_OBJECT_DIGEST = `sha256:${'c'.repeat(64)}`;
const MANAGED_OUTPUT_ASSOCIATION_ID = 'managed-output-r3';
const MANAGED_OUTPUT_OBJECT_ID = `sha256:${'d'.repeat(64)}`;

const exactGenTaskInput = {
  project: PROJECT_ID,
  capability_id: CAPABILITY_ID,
  capability_digest: CAPABILITY_DIGEST,
  schema_version: '1' as const,
  input_object_ids: [INPUT_OBJECT_ID],
  spec: {
    family: 'image_generation',
    params: { prompt: 'a lighthouse' },
    output_policy: {},
  },
  storage_estimate: { scratch_bytes: 0, output_bytes: 0 },
  generation_intent: {
    version: 1,
    modality: 'video',
    partial_success_policy: 'allow',
    groups: [
      {
        group_key: 'main',
        selectors: [
          { selector: 'video', ordinal: 0, variant_key: 'original' },
        ],
      },
    ],
  },
  settlement_effect: {},
};

const generation = {
  generation_id: 'generation-r2',
  project_id: PROJECT_ID,
  source_task_id: 'task-r3',
  type: 'image',
  status: 'created',
  metadata: { tool_type: 'image-gen' },
  version: 4,
  created_at: '2026-09-11T00:00:00Z',
  updated_at: '2026-09-11T00:01:00Z',
};

const variant = {
  variant_id: 'variant-r2',
  generation_id: generation.generation_id,
  object_id: `sha256:${'2'.repeat(64)}`,
  variant_type: 'original',
  metadata: { is_primary: true },
  created_at: '2026-09-11T00:00:30Z',
};

function json(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function receipt(commandKind: string, key: string, projectId = PROJECT_ID) {
  return {
    receipt_id: `${commandKind}:${key}`,
    command_kind: commandKind,
    idempotency_key: key,
    request_hash: `sha256:${'b'.repeat(64)}`,
    project_id: projectId,
    project_seq: [1, 1],
    event_ids: [],
    result: {},
    created_at: '2026-09-11T00:00:00Z',
  };
}

function createTransport(options: { revokeFirstMediaRead?: boolean } = {}) {
  const requests: Array<{ method: string; path: string; headers: Record<string, string>; body?: unknown }> = [];
  let mediaReads = 0;
  const task = {
    task_id: 'task-r3',
    run_id: 'run-r3',
    project_id: PROJECT_ID,
    state: 'queued' as 'queued' | 'cancelled' | 'retrying',
    version: 1,
    capability_id: CAPABILITY_ID,
    capability_digest: CAPABILITY_DIGEST,
    idempotency_key: 'reigh.admit:r3',
    created_at: '2026-09-11T00:00:00Z',
    updated_at: '2026-09-11T00:00:00Z',
    attempt_id: null,
    runtime_epoch: 7,
    input_object_ids: [INPUT_OBJECT_ID],
    spec: exactGenTaskInput.spec,
    generation_intent: exactGenTaskInput.generation_intent,
    result: null,
  };

  const transport: Transport = async (method, path, headers, body) => {
    const parsedBody = body === undefined
      ? undefined
      : JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>;
    requests.push({ method, path, headers, ...(parsedBody ? { body: parsedBody } : {}) });

    if (path === '/v1/health') {
      return { status: 200, headers: {}, body: json({ status: 'ok', protocol: 'workspace.v1', schema_digest: 'sha256:test', runtime_epoch: 7 }) };
    }
    if (path === '/v1/handshake') {
      return { status: 200, headers: {}, body: json({ protocol: 'workspace.v1', schema_digest: 'sha256:test', session_id: 'session-r2-r3', actor_id: 'owner', realm_id: 'realm-r2', scopes: ['handshake', 'projects:read', 'tasks:read', 'tasks:write'] }) };
    }
    if (path === '/v1/realm') {
      return { status: 200, headers: {}, body: json({ realm_id: 'realm-r2', display_name: 'R2/R3 fixture', version: 1, created_at: '2026-09-11T00:00:00Z' }) };
    }
    if (path === '/v1/capabilities?limit=50') {
      return {
        status: 200,
        headers: {},
        body: json({
          items: [{
            capability_id: CAPABILITY_ID,
            definition_digest: CAPABILITY_DIGEST,
            status: 'ready',
            required_resource_keys: [],
            estimated_scratch_bytes: 0,
            estimated_output_bytes: 0,
          }],
          next_cursor: null,
        }),
      };
    }
    if (path === `/v1/projects/${encodeURIComponent(PROJECT_ID)}/generations?limit=2&cursor=generations-7`) {
      return { status: 200, headers: {}, body: json({ items: [generation], next_cursor: 'generations-8' }) };
    }
    if (path === `/v1/generations/${generation.generation_id}/variants?limit=2&cursor=variants-3`) {
      return { status: 200, headers: {}, body: json({ items: [variant], next_cursor: 'variants-4' }) };
    }
    if (path === `/v1/objects/${MEDIA_OBJECT_ID}` && (method === 'GET' || method === 'HEAD')) {
      if (options.revokeFirstMediaRead && mediaReads++ === 0) {
        return { status: 401, headers: {}, body: json({ code: 'unauthorized', message: 'credential revoked' }) };
      }
      const ranged = headers.Range !== undefined;
      return {
        status: ranged ? 206 : 200,
        headers: {
          ETag: `"${MEDIA_OBJECT_DIGEST}"`,
          'Accept-Ranges': 'bytes',
          ...(ranged ? { 'Content-Range': 'bytes 0-3/4' } : {}),
        },
        body: method === 'HEAD' ? new Uint8Array() : new Uint8Array([1, 2, 3, 4]),
      };
    }
    if (method === 'POST' && path === '/v1/tasks') {
      expect(headers['Idempotency-Key']).toBe('reigh.admit:r3');
      expect(parsedBody).toEqual({ schema_version: '1', ...exactGenTaskInput });
      return { status: 201, headers: {}, body: json({ data: task, receipt: receipt('task.create', 'reigh.admit:r3') }) };
    }
    if (method === 'GET' && path === '/v1/tasks/task-r3') {
      return { status: 200, headers: {}, body: json(task) };
    }
    if (method === 'GET' && path === `/v1/projects/${encodeURIComponent(PROJECT_ID)}/tasks?limit=1&cursor=tasks-2`) {
      return { status: 200, headers: {}, body: json({ items: [task], next_cursor: 'tasks-3' }) };
    }
    if (method === 'POST' && path === `/v1/managed-outputs/${MANAGED_OUTPUT_ASSOCIATION_ID}/export`) {
      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Idempotency-Key']).toBeTruthy();
      expect(parsedBody).toEqual({
        destination_filename: 'retained-output.mp4',
        expected: {
          project_id: PROJECT_ID,
          run_id: 'run-r3',
          task_id: 'task-r3',
          attempt_id: 'attempt-r3',
          association_id: MANAGED_OUTPUT_ASSOCIATION_ID,
          output_port: 'video',
          role: 'output',
          object_id: MANAGED_OUTPUT_OBJECT_ID,
          digest: MANAGED_OUTPUT_OBJECT_ID,
          size: 4,
          filename: 'retained-output.mp4',
          media_type: 'video/mp4',
          executor_id: 'executor-r3',
          lease_id: 'lease-r3',
          fence: 6,
          runtime_epoch: 7,
        },
      });
      return {
        status: 200,
        headers: {},
        body: json({
          data: {
            export_id: 'export-r3',
            association_id: MANAGED_OUTPUT_ASSOCIATION_ID,
            project_id: PROJECT_ID,
            run_id: 'run-r3',
            task_id: 'task-r3',
            attempt_id: 'attempt-r3',
            executor_id: 'executor-r3',
            lease_id: 'lease-r3',
            fence: 6,
            runtime_epoch: 7,
            output_port: 'video',
            role: 'output',
            object_id: MANAGED_OUTPUT_OBJECT_ID,
            digest: MANAGED_OUTPUT_OBJECT_ID,
            size: 4,
            filename: 'retained-output.mp4',
            media_type: 'video/mp4',
            producer: { capability_id: 'rendering.render' },
            destination: { root: '/runtime/export-root', filename: 'retained-output.mp4' },
            source_provenance: { task_id: 'task-r3', attempt_id: 'attempt-r3' },
            exported_at: '2026-09-11T00:02:00Z',
          },
          receipt: receipt('managed_output.export', headers['Idempotency-Key'] ?? ''),
        }),
      };
    }
    if (method === 'POST' && path === '/v1/tasks/task-r3/cancel') {
      expect(headers['Idempotency-Key']).toBe('reigh.cancel:r3');
      expect(parsedBody).toEqual({ expected_version: 1 });
      task.state = 'cancelled';
      task.version = 2;
      return { status: 200, headers: {}, body: json({ data: task, receipt: receipt('task.cancel', 'reigh.cancel:r3') }) };
    }
    if (method === 'POST' && path === '/v1/tasks/task-r3/retry') {
      expect(headers['Idempotency-Key']).toBe('reigh.retry:r3');
      expect(parsedBody).toEqual({ expected_version: 2 });
      task.state = 'retrying';
      task.version = 3;
      return { status: 200, headers: {}, body: json({ data: task, receipt: receipt('task.retry', 'reigh.retry:r3') }) };
    }
    throw new Error(`unexpected ${method} ${path}`);
  };

  return { requests, task, transport };
}

describe('ReighRuntimeClient canonical Runtime reads and browser task seam', () => {
  it('preserves generated generation/variant cursors and managed identities', async () => {
    const fixture = createTransport();
    const client = new ReighRuntimeClient({ baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    const generations = await client.listGenerations(PROJECT_ID, 'generations-7', 2);
    const variants = await client.listVariants(generation.generation_id, 'variants-3', 2);
    expect(generations).toEqual({ items: [generation], next_cursor: 'generations-8' });
    expect(variants).toEqual({ items: [variant], next_cursor: 'variants-4' });
    expect(generations.items[0]?.generation_id).toBe('generation-r2');
    expect(variants.items[0]?.object_id).toBe(`sha256:${'2'.repeat(64)}`);
    expect(fixture.requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /v1/health',
      'POST /v1/handshake',
      'GET /v1/realm',
      'GET /v1/projects/project%2Fr2/generations?limit=2&cursor=generations-7',
      'GET /v1/generations/generation-r2/variants?limit=2&cursor=variants-3',
    ]);
  });

  it('reopens the cached handshake and preserves generated Range/ETag media identity', async () => {
    const fixture = createTransport();
    const client = new ReighRuntimeClient({ baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    await client.ensureSession();
    const ranged = await client.getObject(MEDIA_OBJECT_ID, [0, 3]);
    const metadata = await client.headObject(MEDIA_OBJECT_ID);
    await client.reconnect();

    expect(ranged.status).toBe(206);
    expect(ranged.etag).toBe(`"${MEDIA_OBJECT_DIGEST}"`);
    expect(ranged.content_range).toBe('bytes 0-3/4');
    expect(metadata.status).toBe(200);
    expect(metadata.etag).toBe(`"${MEDIA_OBJECT_DIGEST}"`);
    expect(fixture.requests.filter(({ path }) => path === '/v1/handshake')).toHaveLength(2);
    expect(fixture.requests.find(({ method, path }) => method === 'GET' && path === `/v1/objects/${MEDIA_OBJECT_ID}`)?.headers.Range)
      .toBe('bytes=0-3');
    expect(fixture.requests.find(({ method, path }) => method === 'HEAD' && path === `/v1/objects/${MEDIA_OBJECT_ID}`)?.headers.Range)
      .toBeUndefined();
  });

  it('clears the cached session and reports a revoked credential truthfully', async () => {
    const fixture = createTransport({ revokeFirstMediaRead: true });
    const client = new ReighRuntimeClient({ baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    await expect(client.getObject(MEDIA_OBJECT_ID)).rejects.toMatchObject({
      name: 'RuntimeAuthenticationError',
      code: 'runtime_authentication',
      status: 401,
      recoveryAction: 'Provide an authenticated connector credential and retry.',
    });

    await expect(client.getObject(MEDIA_OBJECT_ID)).resolves.toMatchObject({
      status: 200,
      etag: `"${MEDIA_OBJECT_DIGEST}"`,
    });
    expect(fixture.requests.filter(({ path }) => path === '/v1/handshake')).toHaveLength(2);
  });

  it('exports one selected managed output with exact identity assertions and a durable receipt', async () => {
    const fixture = createTransport();
    const client = new ReighRuntimeClient({ baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    const exported = await client.exportManagedOutput(
      MANAGED_OUTPUT_ASSOCIATION_ID,
      'retained-output.mp4',
      {
        project_id: PROJECT_ID,
        run_id: 'run-r3',
        task_id: 'task-r3',
        attempt_id: 'attempt-r3',
        association_id: MANAGED_OUTPUT_ASSOCIATION_ID,
        output_port: 'video',
        role: 'output',
        object_id: MANAGED_OUTPUT_OBJECT_ID,
        digest: MANAGED_OUTPUT_OBJECT_ID,
        size: 4,
        filename: 'retained-output.mp4',
        media_type: 'video/mp4',
        executor_id: 'executor-r3',
        lease_id: 'lease-r3',
        fence: 6,
        runtime_epoch: 7,
      },
    );

    expect(exported).toMatchObject({
      export_id: 'export-r3',
      association_id: MANAGED_OUTPUT_ASSOCIATION_ID,
      object_id: MANAGED_OUTPUT_OBJECT_ID,
      digest: MANAGED_OUTPUT_OBJECT_ID,
      size: 4,
      filename: 'retained-output.mp4',
      runtime_epoch: 7,
    });
    expect(exported.receipt).toMatchObject({
      command_kind: 'managed_output.export',
      project_id: PROJECT_ID,
      event_ids: [],
    });
    expect(fixture.requests.at(-1)?.path).toBe(`/v1/managed-outputs/${MANAGED_OUTPUT_ASSOCIATION_ID}/export`);
  });

  it('uses the exact GEN/UE admission mapping and keeps task lifecycle browser-bounded', async () => {
    const fixture = createTransport();
    const client = new ReighRuntimeClient({ baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    const capabilities = await client.listCapabilities();
    expect(capabilities.items[0]).toMatchObject({
      capability_id: CAPABILITY_ID,
      definition_digest: CAPABILITY_DIGEST,
      status: 'ready',
    });
    expect(exactGenTaskInput.capability_digest).toBe(capabilities.items[0]?.definition_digest);

    const admitted = await client.admitTask(exactGenTaskInput, 'reigh.admit:r3');
    expect(admitted).toMatchObject({
      task_id: 'task-r3',
      project_id: PROJECT_ID,
      capability_id: CAPABILITY_ID,
      capability_digest: CAPABILITY_DIGEST,
      input_object_ids: [INPUT_OBJECT_ID],
      generation_intent: exactGenTaskInput.generation_intent,
      state: 'queued',
      version: 1,
    });
    expect(admitted.receipt.command_kind).toBe('task.create');

    await expect(client.getTask('task-r3')).resolves.toMatchObject({ task_id: 'task-r3', state: 'queued' });
    await expect(client.listProjectTasks(PROJECT_ID, 'tasks-2', 1)).resolves.toEqual({ items: [fixture.task], next_cursor: 'tasks-3' });

    const cancelled = await client.cancelTask('task-r3', 'reigh.cancel:r3', 1);
    expect(cancelled).toMatchObject({ task_id: 'task-r3', state: 'cancelled', version: 2 });
    const retried = await client.retryTask('task-r3', 'reigh.retry:r3', 2);
    expect(retried).toMatchObject({ task_id: 'task-r3', state: 'retrying', version: 3 });
    expect(retried.receipt.command_kind).toBe('task.retry');

    expect(fixture.requests.filter(({ path }) => path === '/v1/tasks').map(({ method }) => method)).toEqual(['POST']);
    expect(fixture.requests.some(({ path }) => path === '/v1/tasks/claim')).toBe(false);
    expect(fixture.requests.some(({ path }) => path.includes('/settle'))).toBe(false);
  });
});
