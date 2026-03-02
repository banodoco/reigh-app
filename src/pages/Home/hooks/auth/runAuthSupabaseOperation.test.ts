import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: mocks.normalizeAndPresentError,
}));

import { runAuthSupabaseOperation } from './runAuthSupabaseOperation';

describe('runAuthSupabaseOperation', () => {
  it('returns success with default policy when operation resolves', async () => {
    const value = { finalized: true };
    const result = await runAuthSupabaseOperation({
      context: 'auth.test.success',
      errorCode: 'should_not_be_used',
      run: async () => value,
    });

    expect(result).toEqual({
      ok: true,
      value,
      policy: 'best_effort',
      recoverable: false,
    });
  });

  it('returns success with provided policy', async () => {
    const result = await runAuthSupabaseOperation({
      context: 'auth.test.success.policy',
      errorCode: 'unused',
      policy: 'degrade',
      run: async () => 'ok',
    });

    expect(result).toEqual({
      ok: true,
      value: 'ok',
      policy: 'degrade',
      recoverable: false,
    });
  });

  it('normalizes errors and returns structured failure metadata', async () => {
    const error = new Error('rpc failed');
    const result = await runAuthSupabaseOperation({
      context: 'auth.test.failure',
      errorCode: 'rpc_failed',
      showToast: true,
      toastTitle: 'Auth Failure',
      run: async () => {
        throw error;
      },
    });

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(
      error,
      {
        context: 'auth.test.failure',
        showToast: true,
        toastTitle: 'Auth Failure',
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe(error);
      expect(result.errorCode).toBe('rpc_failed');
      expect(result.policy).toBe('best_effort');
      expect(result.recoverable).toBe(true);
      expect(result.cause).toBe(error);
    }
  });
});
