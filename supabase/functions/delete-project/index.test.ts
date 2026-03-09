import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as DeleteProjectEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  withEdgeRequest: vi.fn(),
  verifyProjectOwnership: vi.fn(),
  checkRateLimit: vi.fn(),
  isRateLimitExceededFailure: vi.fn(),
  rateLimitFailureResponse: vi.fn(),
  toErrorMessage: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  withEdgeRequest: (...args: unknown[]) => mocks.withEdgeRequest(...args),
  NO_SESSION_RUNTIME_OPTIONS: {},
}));

vi.mock('../_shared/auth.ts', () => ({
  verifyProjectOwnership: (...args: unknown[]) => mocks.verifyProjectOwnership(...args),
}));

vi.mock('../_shared/rateLimit.ts', () => ({
  checkRateLimit: (...args: unknown[]) => mocks.checkRateLimit(...args),
  isRateLimitExceededFailure: (...args: unknown[]) => mocks.isRateLimitExceededFailure(...args),
  rateLimitFailureResponse: (...args: unknown[]) => mocks.rateLimitFailureResponse(...args),
}));

vi.mock('../_shared/errorMessage.ts', () => ({
  toErrorMessage: (...args: unknown[]) => mocks.toErrorMessage(...args),
}));

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function createSupabaseAdmin(deleteError: { message: string } | null = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ error: deleteError }),
  };
}

function createContext(overrides?: {
  supabaseAdmin?: ReturnType<typeof createSupabaseAdmin>;
  logger?: ReturnType<typeof createLogger>;
  auth?: { isServiceRole?: boolean; userId?: string | null };
  body?: Record<string, unknown>;
}) {
  return {
    supabaseAdmin: overrides?.supabaseAdmin ?? createSupabaseAdmin(),
    logger: overrides?.logger ?? createLogger(),
    auth: overrides?.auth ?? { isServiceRole: false, userId: 'user-1' },
    body: overrides?.body ?? { projectId: 'project-1' },
  };
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('delete-project edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(DeleteProjectEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();

    mocks.verifyProjectOwnership.mockResolvedValue({ success: true, projectId: 'project-1' });
    mocks.checkRateLimit.mockResolvedValue({ ok: true, policy: 'strict', value: {} });
    mocks.isRateLimitExceededFailure.mockReturnValue(false);
    mocks.rateLimitFailureResponse.mockReturnValue(new Response('rate limit exceeded', { status: 429 }));
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(createContext());
      },
    );
  });

  it('returns the shared lifecycle response untouched', async () => {
    mocks.withEdgeRequest.mockResolvedValue(new Response('preflight', { status: 200 }));

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/delete-project', { method: 'OPTIONS' }));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('preflight');
  });

  it('returns 401 when auth user is missing', async () => {
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(createContext({ auth: { isServiceRole: false, userId: '' } }));
      },
    );

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/delete-project', { method: 'POST' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns 403 when project ownership verification fails', async () => {
    mocks.verifyProjectOwnership.mockResolvedValue({
      success: false,
      error: 'Forbidden: You do not own this project',
      statusCode: 403,
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/delete-project', { method: 'POST' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: 'Forbidden: You do not own this project' });
  });

  it('returns rate-limit response when threshold is exceeded', async () => {
    const logger = createLogger();
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(createContext({ logger }));
      },
    );
    mocks.checkRateLimit.mockResolvedValue({ ok: false, reason: 'limit' });
    mocks.isRateLimitExceededFailure.mockReturnValue(true);
    mocks.rateLimitFailureResponse.mockReturnValue(new Response('limited', { status: 429 }));

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/delete-project', { method: 'POST' }));

    expect(response.status).toBe(429);
    await expect(response.text()).resolves.toBe('limited');
    expect(logger.warn).toHaveBeenCalled();
  });

  it('returns 400 when projectId is missing', async () => {
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(createContext({ body: {} }));
      },
    );

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/delete-project', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Missing projectId' });
  });

  it('deletes project successfully', async () => {
    const supabaseAdmin = createSupabaseAdmin();
    mocks.withEdgeRequest.mockImplementation(
      async (_req: Request, _opts: unknown, handler: (ctx: unknown) => Promise<Response>) => {
        return handler(createContext({ supabaseAdmin }));
      },
    );

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/delete-project', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('delete_project_with_extended_timeout', {
      p_project_id: 'project-1',
      p_user_id: 'user-1',
    });
  });
});
