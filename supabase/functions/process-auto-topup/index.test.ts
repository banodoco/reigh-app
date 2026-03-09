import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as ProcessAutoTopupEntrypoint from './index.ts';

const mocks = vi.hoisted(() => ({
  bootstrapEdgeHandler: vi.fn(),
  createStripeClient: vi.fn(),
  validatePersistedAutoTopupConfig: vi.fn(),
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
  createStripeClient: (...args: unknown[]) => mocks.createStripeClient(...args),
  validatePersistedAutoTopupConfig: (...args: unknown[]) => mocks.validatePersistedAutoTopupConfig(...args),
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
  const user = {
    id: 'user-1',
    credits: 20,
    auto_topup_enabled: true,
    auto_topup_amount: 500,
    auto_topup_threshold: 100,
    auto_topup_last_triggered: null,
    stripe_customer_id: 'cus_1',
    stripe_payment_method_id: 'pm_1',
    email: 'user@example.com',
  };

  const userSelectSingle = vi.fn().mockResolvedValue({ data: user, error: null });
  const userSelectEq = vi.fn().mockReturnValue({ single: userSelectSingle });
  const userSelect = vi.fn().mockReturnValue({ eq: userSelectEq });

  const claimSingle = vi.fn().mockResolvedValue({ data: { id: 'user-1' }, error: null });
  const claimSelect = vi.fn().mockReturnValue({ single: claimSingle });
  const claimOr = vi.fn().mockReturnValue({ select: claimSelect });
  const claimEq = vi.fn().mockReturnValue({ or: claimOr });
  const claimUpdate = vi.fn().mockReturnValue({ eq: claimEq });

  const ledgerInsert = vi.fn().mockResolvedValue({ error: null });

  const from = vi.fn().mockImplementation((table: string) => {
    if (table === 'users') {
      return {
        select: userSelect,
        update: claimUpdate,
      };
    }

    if (table === 'credits_ledger') {
      return {
        insert: ledgerInsert,
      };
    }

    return {
      select: vi.fn(),
      update: vi.fn(),
      insert: vi.fn(),
    };
  });

  return {
    from,
    userSelect,
    userSelectEq,
    userSelectSingle,
    claimUpdate,
    claimEq,
    claimOr,
    claimSelect,
    claimSingle,
    ledgerInsert,
  };
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('process-auto-topup edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(ProcessAutoTopupEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    __resetServeHandler();

    mocks.validatePersistedAutoTopupConfig.mockReturnValue({ ok: true });
    mocks.createStripeClient.mockReturnValue({
      ok: true,
      value: {
        paymentIntents: {
          create: vi.fn().mockResolvedValue({
            id: 'pi_1',
            status: 'succeeded',
            amount_received: 500,
            currency: 'usd',
          }),
        },
      },
    });

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger: createLogger(),
        body: { userId: 'user-1' },
        auth: { isServiceRole: true },
      },
    });
  });

  it('returns bootstrap failure response untouched', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: false,
      response: new Response('blocked', { status: 403 }),
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/process-auto-topup', { method: 'POST' }));

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
        body: { userId: 'user-1' },
        auth: { isServiceRole: false },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/process-auto-topup', { method: 'POST' }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: 'Authentication failed' });
    expect(logger.flush).toHaveBeenCalled();
  });

  it('returns 400 when userId is missing', async () => {
    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin: createSupabaseAdmin(),
        logger: createLogger(),
        body: { userId: '' },
        auth: { isServiceRole: true },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/process-auto-topup', { method: 'POST' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'userId is required and must be a string',
    });
  });

  it('processes successful auto-top-up payment', async () => {
    const supabaseAdmin = createSupabaseAdmin();
    const logger = createLogger();

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin,
        logger,
        body: { userId: 'user-1' },
        auth: { isServiceRole: true },
      },
    });

    const handler = await loadHandler();
    const response = await handler(new Request('https://edge.test/process-auto-topup', { method: 'POST' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      paymentIntentId: 'pi_1',
      amount: 500,
      dollarAmount: 5,
      originalBalance: 20,
      message: 'Auto-topped up $5.00',
    });

    expect(supabaseAdmin.from).toHaveBeenCalledWith('users');
    expect(supabaseAdmin.from).toHaveBeenCalledWith('credits_ledger');
    expect(supabaseAdmin.ledgerInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        amount: 500,
        type: 'auto_topup',
      }),
    );
    expect(logger.flush).toHaveBeenCalled();
  });
});
