import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as SetupAutoTopupEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  bootstrapEdgeHandler: vi.fn(),
  validateAutoTopupConfig: vi.fn(),
  dollarsToCents: vi.fn((value: number) => Math.round(value * 100)),
  toErrorMessage: vi.fn((error: unknown) => (error instanceof Error ? error.message : String(error))),
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

vi.mock('../_shared/autoTopupDomain.ts', () => ({
  validateAutoTopupConfig: (...args: unknown[]) => mocks.validateAutoTopupConfig(...args),
  dollarsToCents: (...args: unknown[]) => mocks.dollarsToCents(...args),
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

function createSupabaseAdmin(updateError: { message: string } | null = null) {
  const eq = vi.fn().mockResolvedValue({ error: updateError });
  const update = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ update });
  return { from, update, eq };
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('setup-auto-topup edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(SetupAutoTopupEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();

    mocks.validateAutoTopupConfig.mockReturnValue({ ok: true });

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger: createLogger(),
        body: {
          autoTopupEnabled: true,
          autoTopupAmount: 5,
          autoTopupThreshold: 2,
        },
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
    const response = await handler(new Request('https://edge.test/setup-auto-topup', { method: 'POST' }));

    expect(response.status).toBe(401);
    await expect(response.text()).resolves.toBe('blocked');
  });

  it('validates autoTopupEnabled type', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger: createLogger(),
        body: { autoTopupEnabled: 'yes' },
        auth: { userId: 'user-1' },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/setup-auto-topup', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'autoTopupEnabled must be a boolean' });
  });

  it('returns validation error from auto-topup domain validator', async () => {
    mocks.validateAutoTopupConfig.mockReturnValue({
      ok: false,
      error: { message: 'Threshold must be lower than amount' },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/setup-auto-topup', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: 'Threshold must be lower than amount' });
  });

  it('updates preferences for enabled auto-topup', async () => {
    const supabaseAdmin = createSupabaseAdmin();
    const logger = createLogger();

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin,
        logger,
        body: {
          autoTopupEnabled: true,
          autoTopupAmount: 5,
          autoTopupThreshold: 2,
        },
        auth: { userId: 'user-1' },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/setup-auto-topup', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: 'Auto-top-up enabled: $5 when balance drops below $2',
    });

    expect(supabaseAdmin.update).toHaveBeenCalledWith({
      auto_topup_enabled: true,
      auto_topup_amount: 500,
      auto_topup_threshold: 200,
    });
    expect(supabaseAdmin.eq).toHaveBeenCalledWith('id', 'user-1');
    expect(logger.flush).toHaveBeenCalled();
  });

  it('ignores client-supplied Stripe identifiers when enabling auto-topup', async () => {
    const supabaseAdmin = createSupabaseAdmin();

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin,
        logger: createLogger(),
        body: {
          autoTopupEnabled: true,
          autoTopupAmount: 5,
          autoTopupThreshold: 2,
          stripeCustomerId: 'cus_1',
          stripePaymentMethodId: 'pm_1',
        },
        auth: { userId: 'user-1' },
      },
    });

    const handler = await loadHandler();
    await handler(new Request('https://edge.test/setup-auto-topup', { method: 'POST' }));

    expect(supabaseAdmin.update).toHaveBeenCalledWith({
      auto_topup_enabled: true,
      auto_topup_amount: 500,
      auto_topup_threshold: 200,
    });
  });

  it('clears thresholds when disabling auto-topup', async () => {
    const supabaseAdmin = createSupabaseAdmin();
    const logger = createLogger();

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin,
        logger,
        body: {
          autoTopupEnabled: false,
          autoTopupAmount: null,
          autoTopupThreshold: null,
        },
        auth: { userId: 'user-1' },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/setup-auto-topup', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      message: 'Auto-top-up disabled',
    });
    expect(supabaseAdmin.update).toHaveBeenCalledWith({
      auto_topup_enabled: false,
      auto_topup_amount: null,
      auto_topup_threshold: null,
    });
  });
});
