import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as GetTaskOutputEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  withEdgeRequest: vi.fn(),
  authorizeTaskActor: vi.fn(),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  withEdgeRequest: (...args: unknown[]) => mocks.withEdgeRequest(...args),
}));

vi.mock('../_shared/taskActorPolicy.ts', () => ({
  authorizeTaskActor: (...args: unknown[]) => mocks.authorizeTaskActor(...args),
}));

vi.mock('../_shared/http.ts', () => ({
  jsonResponse: (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
}));

describe('get-task-output edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(GetTaskOutputEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();
  });

  it('rejects unsupported HTTP methods', async () => {
    mocks.withEdgeRequest.mockResolvedValue(new Response('Method not allowed', { status: 405 }));

    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/get-task-output', { method: 'GET' }),
    );

    expect(response.status).toBe(405);
    expect(await response.text()).toContain('Method not allowed');
  });

  it('requires task_id in request body', async () => {
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _options: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler({
          supabaseAdmin: { from: vi.fn() },
          logger: { error: vi.fn(), info: vi.fn(), setDefaultTaskId: vi.fn() },
          body: {},
          auth: { isServiceRole: true, userId: null, success: true },
        });
      },
    );

    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/get-task-output', {
        method: 'POST',
        headers: { authorization: 'Bearer service-role-key' },
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('task_id is required');
  });

  it('returns the full supported output payload after task authorization', async () => {
    const single = vi.fn().mockResolvedValue({
      data: {
        id: 'task-1',
        status: 'Complete',
        output_location: 'https://example.com/out.mp4',
        params: { prompt: 'hello' },
        dependant_on: ['dep-1'],
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ single });
    const select = vi.fn().mockReturnValue({ eq });
    const supabaseAdmin = {
      from: vi.fn().mockReturnValue({ select }),
    };
    const logger = {
      error: vi.fn(),
      info: vi.fn(),
      setDefaultTaskId: vi.fn(),
    };

    mocks.authorizeTaskActor.mockResolvedValue({
      ok: true,
      value: {
        isServiceRole: false,
        callerId: 'user-1',
        taskOwnerVerified: true,
      },
    });
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _options: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler({
          supabaseAdmin,
          logger,
          body: { task_id: 'task-1' },
          auth: { isServiceRole: false, userId: 'user-1', success: true },
        });
      },
    );

    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/get-task-output', {
        method: 'POST',
        body: JSON.stringify({ task_id: 'task-1' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(eq).toHaveBeenCalledWith('id', 'task-1');
    await expect(response.json()).resolves.toEqual({
      status: 'Complete',
      output_location: 'https://example.com/out.mp4',
      params: { prompt: 'hello' },
      dependant_on: ['dep-1'],
    });
  });
});
