import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createStripeClient,
  dollarsToCents,
  getAutoTopupConfigFailure,
  requireFrontendUrl,
  requireStripeSecretKey,
  validateAutoTopupConfig,
  validateCreditPurchaseAmount,
  validatePersistedAutoTopupConfig,
} from './autoTopupDomain.ts';

type DenoEnvLike = {
  get: (key: string) => string | undefined;
};

describe('autoTopupDomain', () => {
  const originalDeno = (globalThis as Record<string, unknown>).Deno;
  let env: Record<string, string | undefined>;

  beforeEach(() => {
    vi.clearAllMocks();
    env = {};
    (globalThis as Record<string, unknown>).Deno = {
      env: {
        get: (key: string) => env[key],
      } satisfies DenoEnvLike,
    };
  });

  afterEach(() => {
    (globalThis as Record<string, unknown>).Deno = originalDeno;
  });

  it('validates purchase amount and auto-top-up config ranges', () => {
    expect(validateCreditPurchaseAmount(10)).toBeNull();
    expect(validateCreditPurchaseAmount(1)).toContain('between $5 and $100');

    expect(validateAutoTopupConfig({
      autoTopupEnabled: false,
    })).toBeNull();

    expect(validateAutoTopupConfig({
      autoTopupEnabled: true,
      autoTopupAmount: 20,
      autoTopupThreshold: 5,
    })).toBeNull();

    expect(validateAutoTopupConfig({
      autoTopupEnabled: true,
      autoTopupAmount: 20,
      autoTopupThreshold: 20,
    })).toBe('autoTopupThreshold must be less than autoTopupAmount');
  });

  it('normalizes cents and validates persisted config values', () => {
    expect(dollarsToCents(12.345)).toBe(1235);
    expect(validatePersistedAutoTopupConfig(2000, 500)).toBeNull();
    expect(validatePersistedAutoTopupConfig(0, 500)).toBe('Auto-top-up amount is not configured correctly');
    expect(validatePersistedAutoTopupConfig(2000, 2500)).toBe(
      'Auto-top-up threshold must be less than auto-top-up amount',
    );
  });

  it('requires env values and maps known config failures', () => {
    env.STRIPE_SECRET_KEY = 'sk_test_123';
    env.FRONTEND_URL = 'https://example.com';

    expect(requireStripeSecretKey()).toBe('sk_test_123');
    expect(requireFrontendUrl()).toBe('https://example.com');
    expect(createStripeClient()).toBeDefined();

    delete env.STRIPE_SECRET_KEY;
    const missingStripeError = (() => {
      try {
        requireStripeSecretKey();
      } catch (error) {
        return error;
      }
      return null;
    })();
    expect(getAutoTopupConfigFailure(missingStripeError)).toEqual({
      envKey: 'STRIPE_SECRET_KEY_MISSING',
      userMessage: 'Stripe not configured',
      logMessage: 'Missing Stripe configuration',
    });

    delete env.FRONTEND_URL;
    const missingFrontendError = (() => {
      try {
        requireFrontendUrl();
      } catch (error) {
        return error;
      }
      return null;
    })();
    expect(getAutoTopupConfigFailure(missingFrontendError)).toEqual({
      envKey: 'FRONTEND_URL_MISSING',
      userMessage: 'Frontend URL not configured',
      logMessage: 'FRONTEND_URL not set in environment',
    });
  });
});
