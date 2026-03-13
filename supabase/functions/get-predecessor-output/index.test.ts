import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';

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

describe('get-predecessor-output edge entrypoint', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();
  });

  it('registers a handler and rejects non-POST methods', async () => {
    mocks.withEdgeRequest.mockResolvedValue(new Response('Method not allowed', { status: 405 }));

    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(new Request('https://edge.test/get-predecessor-output', { method: 'GET' }));

    expect(response.status).toBe(405);
  });

  it('requires task_id in JSON body', async () => {
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
      new Request('https://edge.test/get-predecessor-output', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('task_id is required');
  });

  it('filters predecessor rows to the authorized parent project for non-service actors', async () => {
    const singleTask = vi.fn().mockResolvedValue({
      data: { id: 'task-parent', project_id: 'project-1', dependant_on: ['dep-1', 'dep-2'] },
      error: null,
    });
    const eqTask = vi.fn().mockReturnValue({ single: singleTask });

    const inDependencies = vi.fn().mockResolvedValue({
      data: [{ id: 'dep-1', status: 'Complete', output_location: 'https://example.com/out.mp4' }],
      error: null,
    });
    const eqProject = vi.fn().mockReturnValue({ in: inDependencies });

    const select = vi.fn()
      .mockReturnValueOnce({ eq: eqTask })
      .mockReturnValueOnce({ eq: eqProject });
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
          body: { task_id: 'task-parent' },
          auth: { isServiceRole: false, userId: 'user-1', success: true },
        });
      },
    );

    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/get-predecessor-output', {
        method: 'POST',
        body: JSON.stringify({ task_id: 'task-parent' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(eqTask).toHaveBeenCalledWith('id', 'task-parent');
    expect(eqProject).toHaveBeenCalledWith('project_id', 'project-1');
    expect(inDependencies).toHaveBeenCalledWith('id', ['dep-1', 'dep-2']);
    await expect(response.json()).resolves.toEqual({
      predecessor_id: 'dep-1',
      output_location: null,
      status: 'Complete',
      predecessors: [
        {
          predecessor_id: 'dep-1',
          output_location: 'https://example.com/out.mp4',
          status: 'Complete',
        },
        {
          predecessor_id: 'dep-2',
          output_location: null,
          status: 'not_found',
        },
      ],
      all_complete: false,
    });
  });
});
