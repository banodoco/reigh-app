import { describe, expect, it } from 'vitest';
import Stripe, { __resetCreateSessionImpl, __setCreateSessionImpl } from './stripe';

describe('stripe test mock', () => {
  it('creates checkout sessions via injectable implementation', async () => {
    __setCreateSessionImpl(async () => ({
      id: 'sess_custom',
      url: 'https://checkout.test/custom',
    }));

    const stripe = new Stripe('secret', {});
    const session = await stripe.checkout.sessions.create({});

    expect(session.id).toBe('sess_custom');
    expect(session.url).toBe('https://checkout.test/custom');

    __resetCreateSessionImpl();
  });
});
