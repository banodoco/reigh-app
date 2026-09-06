import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentAndRethrow: (error: unknown) => {
    throw error;
  },
}));

import { createTask, ingestProjectInput } from './createTask';
import { createFakeBridgeRouter, type FakeBridgeRouter } from '@/test/fakeBridgeRouter.ts';

const FAKE_ORIGIN = 'http://bridge.fake';

let router: FakeBridgeRouter;
let fetchMock: Mock;

beforeEach(() => {
  router = createFakeBridgeRouter();
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input), FAKE_ORIGIN);
    return await router.handle(new Request(`${FAKE_ORIGIN}${url.pathname}${url.search}`, init));
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function lastAdmitCall(): { url: string; init: RequestInit } {
  const admissionCalls = fetchMock.mock.calls.filter(([input, init]) => {
    const url = new URL(input instanceof Request ? input.url : String(input), FAKE_ORIGIN);
    return url.pathname.endsWith('/tasks') && (init as RequestInit | undefined)?.method === 'POST';
  });
  expect(admissionCalls.length).toBeGreaterThan(0);
  const [input, init] = admissionCalls[admissionCalls.length - 1] as [RequestInfo | URL, RequestInit];
  const url = new URL(input instanceof Request ? input.url : String(input), FAKE_ORIGIN);
  return { url: url.pathname, init };
}

function lastAdmitBody(): Record<string, unknown> {
  const { init } = lastAdmitCall();
  return JSON.parse(init.body as string) as Record<string, unknown>;
}

function admissionParams(overrides: Record<string, unknown> = {}) {
  return {
    project: 'demo-project',
    capability_id: 'astrid.image_generation',
    capability_digest: `sha256:${'a'.repeat(64)}`,
    schema_version: '1' as const,
    input_object_ids: [],
    spec: {
      family: 'image_generation',
      params: { prompt: 'hi' },
      output_policy: {},
    },
    storage_estimate: {
      estimated_scratch_bytes: 0,
      estimated_output_bytes: 0,
    },
    settlement_effect: {},
    ...overrides,
  };
}

describe('createTask R1 admission over the fake bridge router', () => {
  it('admits with a per-call Idempotency-Key header and maps the response', async () => {
    const result = await createTask({
      ...admissionParams(),
    });

    const { url, init } = lastAdmitCall();
    // Frozen R1 route + required receipt header.
    expect(url).toBe('/api/astrid/projects/demo-project/tasks');
    const headers = init.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toEqual(expect.any(String));
    expect(headers['Idempotency-Key'].length).toBeGreaterThan(0);

    expect(result.task_id).toBeTruthy();
    expect(result.status).toBe('Queued');
  });

  it('ingests producer bytes into project CAS without turning locators into IDs', async () => {
    const input = new Blob([new Uint8Array([7, 0, 255])], { type: 'image/png' });
    const committed = await ingestProjectInput('demo-project', input);
    expect(committed.object_id).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect([...router.state.runtimeObjectBodies.get(committed.object_id)!]).toEqual([7, 0, 255]);
  });

  it('rejects locator-shaped input IDs before catalog or admission', async () => {
    await expect(createTask(admissionParams({
      input_object_ids: ['https://example.com/image.png'],
    }))).rejects.toThrow('canonical HC-04');
    expect(router.state.admissions).toBe(0);
  });

  it('fails closed on a catalog digest mismatch before admission', async () => {
    await expect(createTask(admissionParams({
      capability_digest: `sha256:${'b'.repeat(64)}`,
    }))).rejects.toThrow('digest mismatch');
    expect(router.state.admissions).toBe(0);
  });

  it('keeps one idempotency key across the transport retry of the same admission', async () => {
    let admissionCalls = 0;
    const idempotencyKeys: string[] = [];
    const flakyFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(input instanceof Request ? input.url : String(input), FAKE_ORIGIN);
      const isAdmission = url.pathname.endsWith('/tasks') && init?.method === 'POST';
      if (isAdmission) {
        admissionCalls += 1;
        const headers = (init?.headers ?? {}) as Record<string, string>;
        idempotencyKeys.push(headers['Idempotency-Key']);
        if (admissionCalls === 1) {
          throw new Error('connection reset');
        }
      }
      return await router.handle(new Request(`${FAKE_ORIGIN}${url.pathname}${url.search}`, init));
    });
    vi.stubGlobal('fetch', flakyFetch);

    await createTask({
      ...admissionParams({ spec: {
        family: 'image_generation',
        params: { prompt: 'retry' },
        output_policy: {},
      } }),
    });

    // Both attempts carried the SAME receipt key; only one task committed.
    expect(idempotencyKeys.length).toBe(2);
    expect(idempotencyKeys[0]).toBe(idempotencyKeys[1]);
    expect(router.state.admissions).toBe(1);
  });

  it('serializes the canonical ordered CAS admission without legacy fields', async () => {
    const request = admissionParams({
      input_object_ids: [`sha256:${'1'.repeat(64)}`, `sha256:${'2'.repeat(64)}`],
    });

    await createTask(request);

    expect(lastAdmitBody()).toEqual(request);
    expect(lastAdmitBody()).not.toHaveProperty('project_id');
    expect(lastAdmitBody()).not.toHaveProperty('family');
    expect(lastAdmitBody()).not.toHaveProperty('input');
    expect(lastAdmitBody()).not.toHaveProperty('materialized_inputs');
    expect(lastAdmitBody()).not.toHaveProperty('idempotency_key');
  });
});
