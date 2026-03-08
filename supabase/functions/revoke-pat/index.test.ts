import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as RevokePatEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  bootstrapEdgeHandler: vi.fn(),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  bootstrapEdgeHandler: (...args: unknown[]) => mocks.bootstrapEdgeHandler(...args),
  NO_SESSION_RUNTIME_OPTIONS: {},
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

function createSupabaseAdmin(deleteError: { message: string } | null = null) {
  const eqUser = vi.fn().mockResolvedValue({ error: deleteError });
  const eqId = vi.fn().mockReturnValue({ eq: eqUser });
  const del = vi.fn().mockReturnValue({ eq: eqId });
  const from = vi.fn().mockReturnValue({ delete: del });
  return { from, del, eqId, eqUser };
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('revoke-pat edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(RevokePatEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger: createLogger(),
        auth: { userId: 'user-1' },
        body: { tokenId: 'token-1' },
      },
    });
  });

  it('returns bootstrap failure response untouched', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: false,
      response: new Response('blocked', { status: 401 }),
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/revoke-pat', { method: 'POST' }));

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
        auth: { userId: '' },
        body: { tokenId: 'token-1' },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/revoke-pat', { method: 'POST' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication failed' });
    expect(logger.flush).toHaveBeenCalled();
  });

  it('returns 400 when tokenId is missing', async () => {
    const logger = createLogger();
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger,
        auth: { userId: 'user-1' },
        body: { tokenId: '' },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/revoke-pat', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'tokenId is required' });
    expect(logger.flush).toHaveBeenCalled();
  });

  it('revokes token successfully', async () => {
    const supabaseAdmin = createSupabaseAdmin();
    const logger = createLogger();

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin,
        logger,
        auth: { userId: 'user-1' },
        body: { tokenId: 'token-1' },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/revoke-pat', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(supabaseAdmin.from).toHaveBeenCalledWith('user_api_tokens');
    expect(supabaseAdmin.eqId).toHaveBeenCalledWith('id', 'token-1');
    expect(supabaseAdmin.eqUser).toHaveBeenCalledWith('user_id', 'user-1');
    expect(logger.flush).toHaveBeenCalled();
  });
});
