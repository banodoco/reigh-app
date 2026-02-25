import { describe, expect, it } from 'vitest';
import {
  RATE_LIMITS,
  checkRateLimit,
  isRateLimitExceededFailure,
  rateLimitFailureResponse,
  rateLimitResponse,
} from './rateLimit.ts';

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

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.policy).toBe('fail_open');
    expect(result.value.allowed).toBe(true);
    expect(result.value.degraded?.reason).toBe('runtime_error');
  });

  it('fails open when limiter RPC returns invalid payload shape', async () => {
    const result = await checkRateLimit(
      {
        rpc: async () => ({
          data: { allowed: true, count: 'oops', reset_at: 123 },
          error: null,
        }),
      },
      'func',
      'user',
      RATE_LIMITS.read,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.policy).toBe('fail_open');
    expect(result.value.allowed).toBe(true);
    expect(result.value.degraded?.reason).toBe('invalid_rpc_payload');
  });

  it('returns rate-limit envelope + retry metadata when blocked', async () => {
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
    await expect(blocked.json()).resolves.toMatchObject({
      error: 'rate_limit_exceeded',
      errorCode: 'rate_limit_exceeded',
      message: expect.stringContaining('Rate limit exceeded'),
      recoverable: true,
      retryAfter: 1,
    });
    expect(blocked.headers.get('Retry-After')).toBe('1');
    expect(blocked.headers.get('X-RateLimit-Limit')).toBe(`${RATE_LIMITS.userAction.maxRequests}`);
    expect(blocked.headers.get('X-RateLimit-Remaining')).toBe('0');
  });

  it('returns denied decision payload for blocked requests and maps it to 429 response', async () => {
    const resetAt = new Date(Date.now() + 2_000).toISOString();
    const result = await checkRateLimit(
      {
        rpc: async () => ({
          data: { allowed: false, count: RATE_LIMITS.userAction.maxRequests, reset_at: resetAt },
          error: null,
        }),
      },
      'func',
      'user',
      RATE_LIMITS.userAction,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.allowed).toBe(false);
    expect(isRateLimitExceededFailure(result)).toBe(true);
    if (result.value.allowed) {
      throw new Error('Expected denied rate-limit result');
    }
    const response = rateLimitFailureResponse(result.value, RATE_LIMITS.userAction);
    expect(response.status).toBe(429);
  });
});
