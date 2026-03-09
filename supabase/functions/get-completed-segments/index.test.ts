import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as GetCompletedSegmentsEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  withEdgeRequest: vi.fn(),
  verifyProjectOwnership: vi.fn(),
  toErrorMessage: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  withEdgeRequest: (...args: unknown[]) => mocks.withEdgeRequest(...args),
}));

vi.mock('../_shared/auth.ts', () => ({
  verifyProjectOwnership: (...args: unknown[]) => mocks.verifyProjectOwnership(...args),
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

function createContext(overrides?: {
  supabaseAdmin?: ReturnType<typeof createServiceRoleTasksSupabase>;
  logger?: ReturnType<typeof createLogger>;
  body?: Record<string, unknown>;
  auth?: { isServiceRole?: boolean; userId?: string | null };
}) {
  return {
    supabaseAdmin: overrides?.supabaseAdmin ?? createServiceRoleTasksSupabase([]),
    logger: overrides?.logger ?? createLogger(),
    body: overrides?.body ?? { run_id: 'run-1' },
    auth: overrides?.auth ?? { isServiceRole: true, userId: null },
  };
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

    mocks.verifyProjectOwnership.mockResolvedValue({ success: true, projectId: 'project-1' });
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(createContext());
      },
    );
  });

  it('returns the shared lifecycle response untouched', async () => {
    mocks.withEdgeRequest.mockResolvedValue(new Response('blocked', { status: 401 }));

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/get-completed-segments', { method: 'POST' }));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('blocked');
  });

  it('returns 400 when run_id is missing', async () => {
    const logger = createLogger();
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(createContext({ logger, body: {} }));
      },
    );

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/get-completed-segments', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'run_id is required' });
    expect(logger.error).toHaveBeenCalled();
  });

  it('requires project_id for non-service user tokens', async () => {
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(
          createContext({
            body: { run_id: 'run-1' },
            auth: { isServiceRole: false, userId: 'user-1' },
          }),
        );
      },
    );

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/get-completed-segments', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'project_id required for user tokens' });
  });

  it('returns 403 when project ownership verification fails', async () => {
    mocks.verifyProjectOwnership.mockResolvedValue({
      success: false,
      error: "Forbidden: You don't own this project",
      statusCode: 403,
    });
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(
          createContext({
            body: { run_id: 'run-1', project_id: 'project-1' },
            auth: { isServiceRole: false, userId: 'user-1' },
          }),
        );
      },
    );

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/get-completed-segments', { method: 'POST' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "Forbidden: You don't own this project" });
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
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(
          createContext({
            supabaseAdmin: createServiceRoleTasksSupabase(rows),
            logger,
            body: { run_id: 'run-abc' },
            auth: { isServiceRole: true, userId: null },
          }),
        );
      },
    );

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/get-completed-segments', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { segment_index: 0, output_location: 'https://cdn.example.com/seg0.mp4' },
      { segment_index: 1, output_location: 'https://cdn.example.com/seg1.mp4' },
      { segment_index: 2, output_location: 'https://cdn.example.com/seg2.mp4' },
    ]);
    expect(logger.info).toHaveBeenCalled();
  });
});
