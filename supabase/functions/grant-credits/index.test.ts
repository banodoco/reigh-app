import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as GrantCreditsEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  bootstrapEdgeHandler: vi.fn(),
  toErrorMessage: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  bootstrapEdgeHandler: (...args: unknown[]) => mocks.bootstrapEdgeHandler(...args),
  NO_SESSION_RUNTIME_OPTIONS: {},
}));

vi.mock('../_shared/errorMessage.ts', () => ({
  toErrorMessage: (...args: unknown[]) => mocks.toErrorMessage(...args),
}));

function createLogger() {
  return {
    info: vi.fn(),
    error: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };
}

function createSupabaseAdmin() {
  const single = vi.fn().mockResolvedValue({
    data: { id: 'ledger-1', user_id: 'user-1', amount: 500 },
    error: null,
  });
  const select = vi.fn().mockReturnValue({ single });
  const insert = vi.fn().mockReturnValue({ select });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'credits_ledger') {
      return { insert };
    }
    return {
      select: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      insert: vi.fn(),
    };
  });

  return { from, insert, select, single };
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('grant-credits edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(GrantCreditsEntrypoint).toBeDefined();
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
        auth: { isServiceRole: true, userId: 'admin-1' },
        body: {
          userId: 'user-1',
          amount: 5,
          description: 'manual grant',
          isWelcomeBonus: false,
        },
      },
    });
  });

  it('handles CORS preflight without bootstrapping', async () => {
    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/grant-credits', { method: 'OPTIONS' }));

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toBe('ok');
    expect(mocks.bootstrapEdgeHandler).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid payload', async () => {
    const handler = await loadHandler();

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger: createLogger(),
        auth: { isServiceRole: true, userId: 'admin-1' },
        body: {
          userId: '',
          amount: 0,
        },
      },
    });

    const response = await handler(new Request('https://edge.test/grant-credits', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.text()).resolves.toContain('userId and positive amount are required');
  });

  it('blocks non-service admin grants', async () => {
    const handler = await loadHandler();

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger: createLogger(),
        auth: { isServiceRole: false, userId: 'user-2' },
        body: {
          userId: 'user-1',
          amount: 5,
          isWelcomeBonus: false,
        },
      },
    });

    const response = await handler(new Request('https://edge.test/grant-credits', { method: 'POST' }));

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toContain('Service role access required');
  });

  it('creates manual credit ledger entry for service role', async () => {
    const supabaseAdmin = createSupabaseAdmin();
    const logger = createLogger();

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin,
        logger,
        auth: { isServiceRole: true, userId: 'admin-1' },
        body: {
          userId: 'user-1',
          amount: 5,
          description: 'manual grant',
          isWelcomeBonus: false,
        },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/grant-credits', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        success: true,
        transaction: { id: 'ledger-1', user_id: 'user-1', amount: 500 },
      }),
    );
    expect(supabaseAdmin.from).toHaveBeenCalledWith('credits_ledger');
    expect(supabaseAdmin.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        amount: 500,
        type: 'manual',
      }),
    );
    expect(logger.flush).toHaveBeenCalled();
  });
});
