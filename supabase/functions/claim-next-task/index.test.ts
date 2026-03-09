import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as ClaimNextTaskEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  withEdgeRequest: vi.fn(),
  rpc: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  loggerDebug: vi.fn(),
  loggerSetDefaultTaskId: vi.fn(),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  withEdgeRequest: (...args: unknown[]) => mocks.withEdgeRequest(...args),
}));

function createContext(body: Record<string, unknown>, auth: { userId?: string | null; isServiceRole?: boolean }) {
  return {
    supabaseAdmin: {
      rpc: mocks.rpc,
    },
    logger: {
      info: mocks.loggerInfo,
      error: mocks.loggerError,
      debug: mocks.loggerDebug,
      setDefaultTaskId: mocks.loggerSetDefaultTaskId,
    },
    body,
    auth,
  };
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('claim-next-task edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(ClaimNextTaskEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();

    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(createContext({}, { userId: 'user-1', isServiceRole: false }));
      },
    );
  });

  it('returns 401 when auth is missing', async () => {
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(createContext({}, { userId: null, isServiceRole: false }));
      },
    );

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/claim-next-task', { method: 'POST' }));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toContain('Authentication failed');
  });

  it('returns 204 when PAT user has no eligible tasks', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/claim-next-task', { method: 'POST' }));

    expect(response.status).toBe(204);
    expect(mocks.rpc).toHaveBeenCalledWith('claim_next_task_user_pat', {
      p_user_id: 'user-1',
      p_include_active: false,
    });
  });

  it('returns claimed task for PAT user', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          task_id: 'task-42',
          params: { prompt: 'hello' },
          task_type: 'image_generation',
          project_id: 'project-7',
        },
      ],
      error: null,
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/claim-next-task', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      task_id: 'task-42',
      params: { prompt: 'hello' },
      task_type: 'image_generation',
      project_id: 'project-7',
    });
    expect(mocks.loggerSetDefaultTaskId).toHaveBeenCalledWith('task-42');
  });

  it('uses service-role RPC path when service role auth is present', async () => {
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(createContext({ run_type: 'api', same_model_only: true }, { userId: null, isServiceRole: true }));
      },
    );

    mocks.rpc.mockResolvedValue({
      data: [
        {
          task_id: 'task-service',
          params: {},
          task_type: 'video_generation',
          project_id: 'project-service',
        },
      ],
      error: null,
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/claim-next-task', { method: 'POST' }));

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('claim_next_task_service_role', {
      p_worker_id: expect.any(String),
      p_include_active: false,
      p_run_type: 'api',
      p_same_model_only: true,
    });
    await expect(response.json()).resolves.toEqual({
      task_id: 'task-service',
      params: {},
      task_type: 'video_generation',
      project_id: 'project-service',
    });
  });
});
