import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as GeneratePatEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  bootstrapEdgeHandler: vi.fn(),
  enforceRateLimit: vi.fn(),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  bootstrapEdgeHandler: (...args: unknown[]) => mocks.bootstrapEdgeHandler(...args),
  NO_SESSION_RUNTIME_OPTIONS: {},
}));

vi.mock('../_shared/rateLimit.ts', () => ({
  enforceRateLimit: (...args: unknown[]) => mocks.enforceRateLimit(...args),
}));

vi.mock('../_shared/http.ts', () => ({
  jsonResponse: (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
}));

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };
}

function createSupabaseAdmin(insertError: { message: string } | null = null) {
  const insert = vi.fn().mockResolvedValue({ error: insertError });
  const from = vi.fn().mockReturnValue({ insert });
  return { from, insert };
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('generate-pat edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(GeneratePatEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();

    mocks.enforceRateLimit.mockResolvedValue(null);
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger: createLogger(),
        body: { label: 'My token' },
        auth: { userId: 'user-1' },
      },
    });
  });

  it('returns bootstrap failure response untouched', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: false,
      response: new Response('blocked', { status: 401 }),
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/generate-pat', { method: 'POST' }));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('blocked');
  });

  it('returns 401 when auth user is missing', async () => {
    const logger = createLogger();
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger,
        body: { label: 'Token' },
        auth: { userId: '' },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/generate-pat', { method: 'POST' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication failed' });
    expect(logger.flush).toHaveBeenCalled();
  });

  it('returns denied response when rate limiter blocks request', async () => {
    mocks.enforceRateLimit.mockResolvedValue(new Response('limited', { status: 429 }));

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/generate-pat', { method: 'POST' }));

    expect(response.status).toBe(429);
    await expect(response.text()).resolves.toBe('limited');
  });

  it('generates token and stores metadata', async () => {
    const supabaseAdmin = createSupabaseAdmin();
    const logger = createLogger();
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin,
        logger,
        body: { label: '' },
        auth: { userId: 'user-1' },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/generate-pat', { method: 'POST' }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(typeof payload.token).toBe('string');
    expect(payload.token).toHaveLength(32);

    expect(supabaseAdmin.from).toHaveBeenCalledWith('user_api_tokens');
    expect(supabaseAdmin.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        label: 'API Token',
      }),
    );
    expect(logger.flush).toHaveBeenCalled();
  });
});
