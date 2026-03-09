import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as GetCompletedSegmentsEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  bootstrapEdgeHandler: vi.fn(),
  toErrorMessage: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  bootstrapEdgeHandler: (...args: unknown[]) => mocks.bootstrapEdgeHandler(...args),
}));

vi.mock('../_shared/http.ts', () => ({
  jsonResponse: (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
}));

vi.mock('../_shared/errorMessage.ts', () => ({
  toErrorMessage: (...args: unknown[]) => mocks.toErrorMessage(...args),
}));

function createLogger() {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };
}

function createServiceRoleTasksSupabase(rows: Array<{ params: unknown; output_location: string | null }>) {
  const limit = vi.fn().mockResolvedValue({ data: rows, error: null });
  const or = vi.fn().mockReturnValue({ limit });
  const eqStatus = vi.fn().mockReturnValue({ or });
  const eqTaskType = vi.fn().mockReturnValue({ eq: eqStatus });
  const select = vi.fn().mockReturnValue({ eq: eqTaskType });
  const from = vi.fn().mockReturnValue({ select });
  return { from };
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('get-completed-segments edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(GetCompletedSegmentsEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createServiceRoleTasksSupabase([]),
        logger: createLogger(),
        body: { run_id: 'run-1' },
        auth: { isServiceRole: true, userId: null },
      },
    });
  });

  it('returns bootstrap failure response untouched', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: false,
      response: new Response('blocked', { status: 401 }),
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/get-completed-segments', { method: 'POST' }));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('blocked');
  });

  it('returns 400 when run_id is missing', async () => {
    const logger = createLogger();
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createServiceRoleTasksSupabase([]),
        logger,
        body: {},
        auth: { isServiceRole: true, userId: null },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/get-completed-segments', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'run_id is required' });
    expect(logger.flush).toHaveBeenCalled();
  });

  it('requires project_id for non-service user tokens', async () => {
    const logger = createLogger();
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createServiceRoleTasksSupabase([]),
        logger,
        body: { run_id: 'run-1' },
        auth: { isServiceRole: false, userId: 'user-1' },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/get-completed-segments', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'project_id required for user tokens' });
    expect(logger.flush).toHaveBeenCalled();
  });

  it('returns sorted completed segment list for service role', async () => {
    const rows = [
      {
        params: JSON.stringify({ segment_index: 2 }),
        output_location: 'https://cdn.example.com/seg2.mp4',
      },
      {
        params: { segment_index: 0 },
        output_location: 'https://cdn.example.com/seg0.mp4',
      },
      {
        params: { segment_index: 1 },
        output_location: 'https://cdn.example.com/seg1.mp4',
      },
    ];

    const logger = createLogger();
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createServiceRoleTasksSupabase(rows),
        logger,
        body: { run_id: 'run-abc' },
        auth: { isServiceRole: true, userId: null },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/get-completed-segments', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { segment_index: 0, output_location: 'https://cdn.example.com/seg0.mp4' },
      { segment_index: 1, output_location: 'https://cdn.example.com/seg1.mp4' },
      { segment_index: 2, output_location: 'https://cdn.example.com/seg2.mp4' },
    ]);
    expect(logger.flush).toHaveBeenCalled();
  });
});
