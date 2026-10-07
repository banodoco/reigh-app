import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';
import {
  bridgeTaskAdmissionRequestSchema,
  runtimeMutationSchema,
  runtimeSha256IdSchema,
  runtimeTaskResourceSchema,
} from '@/tools/video-editor/data/bridgeContract.ts';
import { runtimeTaskReadPageSchema, runtimeTaskReadResourceSchema } from './taskReadSchemas.ts';
import { AstridLocalTaskRoutes } from './taskRoutes.ts';
import type { AstridBridgeTransport } from './transport.ts';

vi.mock('./capabilityCensus.ts', () => ({ observeAstridCapabilityFailure: vi.fn() }));

const hex = 'a'.repeat(64);
const canonical = `sha256:${hex}`;

function task(overrides: Record<string, unknown> = {}) {
  return {
    task_id: 'task-1', run_id: 'run-1', project_id: 'demo', state: 'succeeded', version: 1,
    capability_id: 'render_export', capability_digest: canonical, schema_version: '1',
    input_object_ids: [canonical], spec: { spec: { family: 'render_export', params: {} } },
    idempotency_key: 'task-1', created_at: '2026-09-24T10:00:00Z',
    updated_at: '2026-09-24T10:01:00Z', attempt_id: null, runtime_epoch: 1,
    ...overrides,
  };
}

const admission = {
  project: 'demo', capability_id: 'render_export', capability_digest: canonical,
  schema_version: '1', input_object_ids: [canonical],
  spec: { family: 'render_export', params: {}, output_policy: {} },
  storage_estimate: { scratch_bytes: 0, output_bytes: 0 },
  settlement_effect: { effect_type: 'project.update', target_id: 'demo', expected_version: 1 },
};

const receipt = {
  receipt_id: 'receipt-1', command_kind: 'task', idempotency_key: 'key-1',
  request_hash: 'hash', project_id: 'demo', project_seq: [1, 1], event_ids: ['event-1'],
  result: {}, created_at: '2026-09-24T10:00:00Z',
};

function routesReturning(payload: unknown) {
  const requestJson = vi.fn(async (_path: string, _options: unknown, schema: z.ZodType) => schema.parse(payload));
  return {
    requestJson,
    routes: new AstridLocalTaskRoutes(
      { requestJson } as unknown as AstridBridgeTransport, { projectSlug: 'demo' },
    ),
  };
}

describe('historical task GET digest decoding', () => {
  it('normalizes a mixed page without dropping rows or changing canonical values or cursors', () => {
    const source = {
      items: [task(), task({ task_id: 'historical', capability_digest: hex })],
      next_cursor: 'cursor/opaque',
    };
    const decoded = runtimeTaskReadPageSchema.parse(source);
    expect(decoded.items).toHaveLength(2);
    expect(decoded.items[0]).toEqual(source.items[0]);
    expect(decoded.items[1]).toMatchObject({
      task_id: 'historical', capability_digest: canonical, input_object_ids: [canonical],
    });
    expect(decoded.next_cursor).toBe('cursor/opaque');
  });

  it('decodes detail without mutating the input or normalizing opaque spec and extension fields', () => {
    const source = task({
      capability_digest: hex,
      spec: { capability_digest: hex, input_object_ids: [hex], nested: { digest: hex } },
      extension: { digest: hex },
    });
    const snapshot = structuredClone(source);
    Object.freeze(source.input_object_ids);
    Object.freeze(source);
    const decoded = runtimeTaskReadResourceSchema.parse(source);
    expect(decoded.capability_digest).toBe(canonical);
    expect(decoded.input_object_ids).toEqual([canonical]);
    expect(decoded.spec).toEqual(snapshot.spec);
    expect(decoded.extension).toEqual(snapshot.extension);
    expect(source).toEqual(snapshot);
  });

  it('keeps input object identities strict on detail and list GET reads', () => {
    const resource = task({ capability_digest: hex, input_object_ids: [hex] });
    expect(runtimeTaskReadResourceSchema.safeParse(resource).success).toBe(false);
    expect(runtimeTaskReadPageSchema.safeParse({ items: [resource], next_cursor: null }).success).toBe(false);
  });

  it.each([
    '', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), `${'a'.repeat(63)}B`,
    'g'.repeat(64), ` ${hex}`, `${hex} `, `${hex}\n`, `sha256:${'a'.repeat(63)}`,
    `sha256:${'A'.repeat(64)}`, `SHA256:${hex}`, `sha256:sha256:${hex}`, `sha512:${hex}`,
    ` ${canonical}`, `${canonical} `, `${canonical}\n`,
    null, 123, [hex], { digest: hex },
  ])('rejects malformed capability digest %j', (malformed) => {
    const resource = task({ capability_digest: malformed });
    expect(runtimeTaskReadResourceSchema.safeParse(resource).success).toBe(false);
    expect(runtimeTaskReadPageSchema.safeParse({ items: [task(), resource], next_cursor: null }).success).toBe(false);
  });

  it('keeps canonical identity, admission request, resource, and mutation response schemas strict', () => {
    expect(runtimeSha256IdSchema.safeParse(hex).success).toBe(false);
    expect(bridgeTaskAdmissionRequestSchema.safeParse(admission).success).toBe(true);
    expect(runtimeMutationSchema(runtimeTaskResourceSchema).safeParse({ data: task(), receipt }).success).toBe(true);
    for (const field of ['capability_digest', 'input_object_ids']) {
      const legacy = { [field]: field === 'capability_digest' ? hex : [hex] };
      expect(bridgeTaskAdmissionRequestSchema.safeParse({ ...admission, ...legacy }).success).toBe(false);
      expect(runtimeTaskResourceSchema.safeParse(task(legacy)).success).toBe(false);
      expect(runtimeMutationSchema(runtimeTaskResourceSchema).safeParse({ data: task(legacy), receipt }).success).toBe(false);
    }
  });

  it('uses the read decoder for both list and detail GET routes', async () => {
    const historical = task({ capability_digest: hex });
    const list = routesReturning({ items: [task(), historical], next_cursor: 'cursor-2' });
    await expect(list.routes.list()).resolves.toMatchObject({ tasks: [{ task_id: 'task-1' }, { task_id: 'task-1' }], next_cursor: 'cursor-2' });
    expect(list.requestJson).toHaveBeenCalledWith('/v1/projects/demo/tasks', {}, runtimeTaskReadPageSchema, 'task list');
    const detail = routesReturning(historical);
    await expect(detail.routes.get('task-1')).resolves.toMatchObject({ task_id: 'task-1', capability: 'render_export' });
    expect(detail.requestJson).toHaveBeenCalledWith('/v1/tasks/task-1', {}, runtimeTaskReadResourceSchema, 'task detail');
  });

  it.each(['capability_digest', 'input_object_ids'])('rejects historical %s on actual admission and cancel response paths', async (field) => {
    const data = task({ [field]: field === 'capability_digest' ? hex : [hex] });
    const { routes, requestJson } = routesReturning({ data, receipt });
    await expect(routes.admit(admission, 'key-1')).rejects.toThrow();
    await expect(routes.cancel('task-1')).rejects.toThrow();
    expect(requestJson).toHaveBeenCalledTimes(2);
  });

  it.each(['capability_digest', 'input_object_ids'])('rejects historical admission request %s before transport', async (field) => {
    const { routes, requestJson } = routesReturning({ data: task(), receipt });
    const request = { ...admission, [field]: field === 'capability_digest' ? hex : [hex] };
    await expect(routes.admit(request, 'key-1')).rejects.toThrow();
    expect(requestJson).not.toHaveBeenCalled();
  });
});
