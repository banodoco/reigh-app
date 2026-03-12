import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as CompleteAutoTopupSetupEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  bootstrapEdgeHandler: vi.fn(),
  ensureStripeClient: vi.fn(),
}));

vi.mock('../_shared/edgeHandler.ts', () => ({
  bootstrapEdgeHandler: (...args: unknown[]) => mocks.bootstrapEdgeHandler(...args),
  NO_SESSION_RUNTIME_OPTIONS: {},
}));

vi.mock('../_shared/autoTopupRequest.ts', () => ({
  ensureStripeClient: (...args: unknown[]) => mocks.ensureStripeClient(...args),
}));

vi.mock('../_shared/http.ts', () => ({
  jsonResponse: (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
}));

vi.mock('../_shared/errorMessage.ts', () => ({
  toErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
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

function createStripeMock() {
  return {
    checkout: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue({
          payment_intent: 'pi_123',
          customer: 'cus_123',
          metadata: {
            userId: 'user_123',
            autoTopupEnabled: 'true',
            autoTopupAmount: '5',
            autoTopupThreshold: '2',
          },
        }),
      },
    },
    paymentIntents: {
      retrieve: vi.fn().mockResolvedValue({
        customer: 'cus_123',
        payment_method: { id: 'pm_123', type: 'card' },
      }),
    },
  };
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('complete-auto-topup-setup edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(CompleteAutoTopupSetupEntrypoint).toBeDefined();
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
        body: { sessionId: 'cs_123', userId: 'user_123' },
        auth: { isServiceRole: true },
      },
    });

    mocks.ensureStripeClient.mockResolvedValue({
      ok: true,
      stripe: createStripeMock(),
    });
  });

  it('returns bootstrap failure response untouched', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: false,
      response: new Response('blocked', { status: 403 }),
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/complete-auto-topup-setup', { method: 'POST' }));

    expect(response.status).toBe(403);
    await expect(response.text()).resolves.toBe('blocked');
  });

  it('returns 401 when auth is not service role', async () => {
    const logger = createLogger();
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger,
        body: { sessionId: 'cs_123', expectedUserId: 'user_123' },
        auth: { isServiceRole: false },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/complete-auto-topup-setup', { method: 'POST' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication failed' });
    expect(logger.flush).toHaveBeenCalled();
  });

  it('returns 400 when required params are missing', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger: createLogger(),
        body: { expectedUserId: 'user_123' },
        auth: { isServiceRole: true },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/complete-auto-topup-setup', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'sessionId is required',
    });
  });

  it('returns 500 when stripe client init fails', async () => {
    const logger = createLogger();
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger,
        body: { sessionId: 'cs_123', expectedUserId: 'user_123' },
        auth: { isServiceRole: true },
      },
    });

    mocks.ensureStripeClient.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error: 'Missing Stripe secret key' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/complete-auto-topup-setup', { method: 'POST' }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: 'Missing Stripe secret key' });
  });

  it('completes setup and persists payment method details', async () => {
    const supabaseAdmin = createSupabaseAdmin();
    const logger = createLogger();
    const stripe = createStripeMock();

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin,
        logger,
        body: { sessionId: 'cs_123', expectedUserId: 'user_123' },
        auth: { isServiceRole: true },
      },
    });

    mocks.ensureStripeClient.mockResolvedValue({ ok: true, stripe });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/complete-auto-topup-setup', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      userId: 'user_123',
      customerId: 'cus_123',
      paymentMethodId: 'pm_123',
      paymentMethodType: 'card',
      message: 'Auto-top-up setup completed successfully',
    });

    expect(supabaseAdmin.from).toHaveBeenCalledWith('users');
    expect(supabaseAdmin.update).toHaveBeenCalledWith({
      auto_topup_amount: 500,
      auto_topup_enabled: true,
      auto_topup_setup_completed: true,
      auto_topup_threshold: 200,
      stripe_customer_id: 'cus_123',
      stripe_payment_method_id: 'pm_123',
    });
    expect(supabaseAdmin.eq).toHaveBeenCalledWith('id', 'user_123');
    expect(logger.flush).toHaveBeenCalled();
  });

  it('rejects checkout sessions whose metadata user does not match the expected user', async () => {
    const logger = createLogger();
    const stripe = createStripeMock();

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger,
        body: { sessionId: 'cs_123', expectedUserId: 'user_other' },
        auth: { isServiceRole: true },
      },
    });

    mocks.ensureStripeClient.mockResolvedValue({ ok: true, stripe });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/complete-auto-topup-setup', { method: 'POST' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: 'Checkout session does not belong to the expected user',
    });
    expect(logger.error).toHaveBeenCalledWith('Checkout session user mismatch', {
      sessionId: 'cs_123',
      expectedUserId: 'user_other',
      metadataUserId: 'user_123',
    });
    expect(logger.flush).toHaveBeenCalled();
  });
});
