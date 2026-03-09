import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as DeleteProjectEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  bootstrapEdgeHandler: vi.fn(),
  checkRateLimit: vi.fn(),
  isRateLimitExceededFailure: vi.fn(),
  rateLimitFailureResponse: vi.fn(),
  toErrorMessage: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  bootstrapEdgeHandler: (...args: unknown[]) => mocks.bootstrapEdgeHandler(...args),
  NO_SESSION_RUNTIME_OPTIONS: {},
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
    flush: vi.fn().mockResolvedValue(undefined),
  };
}

function createSupabaseAdmin(deleteError: { message: string } | null = null) {
  return {
    rpc: vi.fn().mockResolvedValue({ error: deleteError }),
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

    mocks.checkRateLimit.mockResolvedValue({ ok: true, policy: 'strict', value: {} });
    mocks.isRateLimitExceededFailure.mockReturnValue(false);
    mocks.rateLimitFailureResponse.mockReturnValue(new Response('rate limit exceeded', { status: 429 }));

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger: createLogger(),
        auth: { userId: 'user-1' },
      },
    });
  });

  it('handles CORS preflight without bootstrapping', async () => {
    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/delete-project', { method: 'OPTIONS' }));

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
    const response = await handler(new Request('https://edge.test/delete-project', { method: 'POST' }));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('blocked');
  });

  it('returns 401 when auth user is missing', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger: createLogger(),
        auth: { userId: '' },
      },
    });

    const handler = await loadHandler();
    const response = await handler(
      new Request('https://edge.test/delete-project', {
        method: 'POST',
        body: JSON.stringify({ projectId: 'project-1' }),
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Unauthorized' });
  });

  it('returns rate-limit response when threshold is exceeded', async () => {
    const logger = createLogger();
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger,
        auth: { userId: 'user-1' },
      },
    });

    mocks.checkRateLimit.mockResolvedValue({ ok: false, reason: 'limit' });
    mocks.isRateLimitExceededFailure.mockReturnValue(true);
    mocks.rateLimitFailureResponse.mockReturnValue(new Response('limited', { status: 429 }));

    const handler = await loadHandler();
    const response = await handler(
      new Request('https://edge.test/delete-project', {
        method: 'POST',
        body: JSON.stringify({ projectId: 'project-1' }),
      }),
    );

    expect(response.status).toBe(429);
    await expect(response.text()).resolves.toBe('limited');
    expect(logger.warn).toHaveBeenCalled();
    expect(logger.flush).toHaveBeenCalled();
  });

  it('returns 400 when projectId is missing', async () => {
    const handler = await loadHandler();
    const response = await handler(
      new Request('https://edge.test/delete-project', {
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Missing projectId' });
  });

  it('deletes project successfully', async () => {
    const supabaseAdmin = createSupabaseAdmin();
    const logger = createLogger();
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin,
        logger,
        auth: { userId: 'user-1' },
      },
    });

    const handler = await loadHandler();
    const response = await handler(
      new Request('https://edge.test/delete-project', {
        method: 'POST',
        body: JSON.stringify({ projectId: 'project-1' }),
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(supabaseAdmin.rpc).toHaveBeenCalledWith('delete_project_with_extended_timeout', {
      p_project_id: 'project-1',
      p_user_id: 'user-1',
    });
    expect(logger.flush).toHaveBeenCalled();
  });
});
