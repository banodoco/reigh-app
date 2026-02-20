import { describe, expect, it } from 'vitest';
import { RATE_LIMITS, checkRateLimit, rateLimitResponse } from './rateLimit.ts';

describe('_shared/rateLimit', () => {
  it('exposes standard rate limit presets', () => {
    expect(RATE_LIMITS.taskCreation.maxRequests).toBeGreaterThan(0);
    expect(RATE_LIMITS.expensive.windowSeconds).toBeGreaterThan(0);
  });

  it('fails open when backend limiter errors', async () => {
    const result = await checkRateLimit(
      {
        rpc: async () => {
          throw new Error('rpc failed');
        },
      },
      'func',
      'user',
      RATE_LIMITS.read,
    );

    expect(result.allowed).toBe(true);
  });

  it('returns 429 payload from rateLimitResponse when blocked', async () => {
    const blocked = rateLimitResponse(
      {
        allowed: false,
        remaining: 0,
        resetAt: new Date(Date.now() + 1000),
        retryAfter: 1,
      },
      RATE_LIMITS.userAction,
    );

    expect(blocked.status).toBe(429);
    await expect(blocked.json()).resolves.toMatchObject({ error: 'Too many requests' });
  });
});
