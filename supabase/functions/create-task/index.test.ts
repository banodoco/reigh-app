import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as CreateTaskEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  bootstrapEdgeHandler: vi.fn(),
  enforceRateLimit: vi.fn(),
  parseCreateTaskBody: vi.fn(),
  buildTaskInsertObject: vi.fn(),
  getErrorMessage: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  bootstrapEdgeHandler: (...args: unknown[]) => mocks.bootstrapEdgeHandler(...args),
  NO_SESSION_RUNTIME_OPTIONS: {},
}));

vi.mock('../_shared/rateLimit.ts', () => ({
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args),
  RATE_LIMITS: {
    taskCreation: { maxRequests: 20, windowSeconds: 60 },
  },
}));

vi.mock('./request.ts', () => ({
  parseCreateTaskBody: (...args: unknown[]) => mocks.parseCreateTaskBody(...args),
  buildTaskInsertObject: (...args: unknown[]) => mocks.buildTaskInsertObject(...args),
  getErrorMessage: (...args: unknown[]) => mocks.getErrorMessage(...args),
}));

function createLogger() {
  return {
    info: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    critical: vi.fn(),
    setDefaultTaskId: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };
}

function createTasksInsertChain(taskId = 'task-1') {
  const single = vi.fn().mockResolvedValue({ data: { id: taskId }, error: null });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });
  return { insert, select, single };
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('create-task edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(CreateTaskEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();

    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.parseCreateTaskBody.mockReturnValue({
      ok: true,
      value: {
        task_id: 'task-client-1',
        params: { prompt: 'hello' },
        task_type: 'image_generation',
        project_id: 'project-1',
        normalizedDependantOn: null,
        idempotency_key: null,
      },
    });
    mocks.buildTaskInsertObject.mockReturnValue({ id: 'task-client-1' });

    const taskInsert = createTasksInsertChain('task-created-1');
    const supabaseAdmin = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'tasks') return { insert: taskInsert.insert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin,
        logger: createLogger(),
        auth: { isServiceRole: true, userId: null },
        body: { task_type: 'image_generation', params: { prompt: 'hello' }, project_id: 'project-1' },
      },
    });
  });

  it('handles CORS preflight', async () => {
    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/create-task', { method: 'OPTIONS' }));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('ok');
    expect(mocks.bootstrapEdgeHandler).not.toHaveBeenCalled();
  });

  it('returns bootstrap failure response untouched', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: false,
      response: new Response('blocked', { status: 401 }),
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/create-task', { method: 'POST' }));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('blocked');
  });

  it('returns 400 when request body parse fails', async () => {
    const logger = createLogger();
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: { from: vi.fn() },
        logger,
        auth: { isServiceRole: true, userId: null },
        body: {},
      },
    });

    mocks.parseCreateTaskBody.mockReturnValue({
      ok: false,
      error: 'params, task_type required',
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/create-task', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe('params, task_type required');
    expect(logger.flush).toHaveBeenCalled();
  });

  it('requires project_id for service-role requests', async () => {
    const logger = createLogger();
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: { from: vi.fn() },
        logger,
        auth: { isServiceRole: true, userId: null },
        body: {},
      },
    });

    mocks.parseCreateTaskBody.mockReturnValue({
      ok: true,
      value: {
        task_id: null,
        params: { foo: 'bar' },
        task_type: 'image_generation',
        project_id: null,
        normalizedDependantOn: null,
        idempotency_key: null,
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/create-task', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toBe('project_id required for service role');
    expect(logger.flush).toHaveBeenCalled();
  });

  it('creates task successfully for service-role requests', async () => {
    const logger = createLogger();
    const taskInsert = createTasksInsertChain('task-created-1');
    const supabaseAdmin = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'tasks') return { insert: taskInsert.insert };
        throw new Error(`Unexpected table: ${table}`);
      }),
    };

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin,
        logger,
        auth: { isServiceRole: true, userId: null },
        body: {
          task_type: 'image_generation',
          params: { prompt: 'hello' },
          project_id: 'project-1',
        },
      },
    });

    mocks.parseCreateTaskBody.mockReturnValue({
      ok: true,
      value: {
        task_id: 'task-client-1',
        params: { prompt: 'hello' },
        task_type: 'image_generation',
        project_id: 'project-1',
        normalizedDependantOn: null,
        idempotency_key: null,
      },
    });
    mocks.buildTaskInsertObject.mockReturnValue({ id: 'task-client-1', project_id: 'project-1' });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/create-task', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      task_id: 'task-created-1',
      status: 'Task queued',
    });
    expect(mocks.enforceRateLimit).not.toHaveBeenCalled();
    expect(logger.setDefaultTaskId).toHaveBeenCalledWith('task-created-1');
    expect(logger.flush).toHaveBeenCalled();
  });
});
