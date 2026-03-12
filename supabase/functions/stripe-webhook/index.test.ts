import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as StripeWebhookEntrypoint from './index.ts';

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

function createLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };
}

function createSupabaseAdmin() {
  const usersEq = vi.fn().mockResolvedValue({ error: null });
  const usersUpdate = vi.fn().mockReturnValue({ eq: usersEq });

  const creditsLedgerMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const creditsLedgerLimit = vi.fn().mockReturnValue({ maybeSingle: creditsLedgerMaybeSingle });
  const creditsLedgerEqTwo = vi.fn().mockReturnValue({ limit: creditsLedgerLimit });
  const creditsLedgerEqOne = vi.fn().mockReturnValue({ eq: creditsLedgerEqTwo });
  const creditsLedgerSelect = vi.fn().mockReturnValue({ eq: creditsLedgerEqOne });
  const creditsLedgerSingle = vi.fn().mockResolvedValue({ data: { id: 'ledger_1' }, error: null });
  const creditsLedgerInsert = vi.fn().mockReturnValue({
    select: vi.fn().mockReturnValue({
      single: creditsLedgerSingle,
    }),
  });

  const from = vi.fn((table: string) => {
    if (table === 'users') {
      return { update: usersUpdate };
    }
    if (table === 'credits_ledger') {
      return {
        select: creditsLedgerSelect,
        insert: creditsLedgerInsert,
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });

  return {
    from,
    usersUpdate,
    usersEq,
    creditsLedgerSelect,
    creditsLedgerInsert,
  };
}

function createStripeMock() {
  return {
    checkout: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue({
          customer: 'cus_123',
          payment_intent: {
            customer: 'cus_123',
            payment_method: {
              id: 'pm_123',
              type: 'card',
            },
          },
        }),
      },
    },
  };
}

function buildSignedRequest(body: string): Request {
  const timestamp = '1710000000';
  const signature = createHmac('sha256', 'whsec_test')
    .update(`${timestamp}.${body}`)
    .digest('hex');

  return new Request('https://edge.test/stripe-webhook', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'stripe-signature': `t=${timestamp},v1=${signature}`,
    },
    body,
  });
}

async function loadHandler() {
  await import('./index.ts');
  return __getServeHandler();
}

describe('stripe-webhook edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(StripeWebhookEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    __resetServeHandler();

    vi.stubGlobal('Deno', {
      env: {
        get: (key: string) => {
          if (key === 'SUPABASE_SERVICE_ROLE_KEY') return 'service-role-key';
          if (key === 'STRIPE_WEBHOOK_SECRET') return 'whsec_test';
          return undefined;
        },
      },
    });

    mocks.bootstrapEdgeHandler.mockImplementation(async (req: Request) => {
      if (req.method !== 'POST') {
        return {
          ok: false,
          response: new Response(
            JSON.stringify({
              errorCode: 'method_not_allowed',
              message: 'Method not allowed',
              recoverable: false,
            }),
            {
              status: 405,
              headers: { 'Content-Type': 'application/json' },
            },
          ),
        };
      }

      return {
        ok: true,
        value: {
          supabaseAdmin: createSupabaseAdmin(),
          logger: createLogger(),
        },
      };
    });

    mocks.ensureStripeClient.mockResolvedValue({
      ok: true,
      stripe: createStripeMock(),
    });
  });

  it('registers a handler and handles OPTIONS preflight', async () => {
    const handler = await loadHandler();

    const response = await handler(
      new Request('https://edge.test/stripe-webhook', { method: 'OPTIONS' }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('"ok":true');
  });

  it('rejects unsupported methods', async () => {
    const handler = await loadHandler();

    const response = await handler(
      new Request('https://edge.test/stripe-webhook', { method: 'GET' }),
    );

    expect(response.status).toBe(405);
    expect(await response.text()).toContain('Method not allowed');
  });

  it('binds auto-topup persistence to verified Stripe session state', async () => {
    const supabaseAdmin = createSupabaseAdmin();
    const logger = createLogger();

    mocks.bootstrapEdgeHandler.mockResolvedValue({
      ok: true,
      value: {
        supabaseAdmin,
        logger,
      },
    });

    const handler = await loadHandler();
    const body = JSON.stringify({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_123',
          amount_total: 2000,
          currency: 'usd',
          customer: 'cus_123',
          payment_intent: 'pi_123',
          metadata: {
            userId: 'user_123',
            amount: '20',
            autoTopupEnabled: 'true',
            autoTopupAmount: '5',
            autoTopupThreshold: '2',
          },
        },
      },
    });

    const response = await handler(buildSignedRequest(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });

    expect(mocks.ensureStripeClient).toHaveBeenCalledTimes(1);
    expect(supabaseAdmin.usersUpdate).toHaveBeenCalledWith({
      auto_topup_enabled: true,
      auto_topup_setup_completed: true,
      auto_topup_amount: 500,
      auto_topup_threshold: 200,
      stripe_customer_id: 'cus_123',
      stripe_payment_method_id: 'pm_123',
    });
    expect(supabaseAdmin.usersEq).toHaveBeenCalledWith('id', 'user_123');
    expect(supabaseAdmin.creditsLedgerInsert).toHaveBeenCalledWith({
      user_id: 'user_123',
      amount: 2000,
      type: 'stripe',
      metadata: {
        stripe_session_id: 'cs_123',
        amount_paid: 2000,
        currency: 'usd',
        dollar_amount: 20,
        auto_topup_enabled: true,
      },
    });
    expect(logger.flush).toHaveBeenCalled();
  });
});
