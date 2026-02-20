import { beforeEach, describe, expect, it, vi } from 'vitest';
import { __getServeHandler, __resetServeHandler } from '../_tests/mocks/denoHttpServer.ts';
import * as StripeCheckoutEntrypoint from './index.ts';

describe('stripe-checkout edge entrypoint', () => {
  it('imports entrypoint module directly', () => {
    expect(StripeCheckoutEntrypoint).toBeDefined();
  });

  beforeEach(() => {
    vi.resetModules();
    __resetServeHandler();
  });

  it('registers a handler and serves CORS preflight', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/stripe-checkout', { method: 'OPTIONS' }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
  });

  it('rejects invalid credit amount before auth work', async () => {
    await import('./index.ts');
    const handler = __getServeHandler();

    const response = await handler(
      new Request('https://edge.test/stripe-checkout', {
        method: 'POST',
        body: JSON.stringify({ amount: 2 }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.text()).toContain('Amount must be a number between $5 and $100');
  });
});
