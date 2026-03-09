import { describe, expect, it, vi } from 'vitest';
import { runOptimisticCacheUpdate } from './optimisticCacheUpdate';

const mocks = vi.hoisted(() => ({
  normalizeAndPresentError: vi.fn(),
}));

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => mocks.normalizeAndPresentError(...args),
}));

describe('runOptimisticCacheUpdate', () => {
  it('returns a best-effort success result when operation completes', () => {
    const operation = vi.fn();

    const result = runOptimisticCacheUpdate(operation, 'ReferenceUpload');

    expect(operation).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      value: undefined,
      policy: 'best_effort',
    });
    expect(mocks.normalizeAndPresentError).not.toHaveBeenCalled();
  });

  it('normalizes errors and returns a recoverable degrade failure result', () => {
    const error = new Error('cache write failed');
    const operation = vi.fn(() => {
      throw error;
    });

    const result = runOptimisticCacheUpdate(operation, 'ReferenceUpload.cache');

    expect(mocks.normalizeAndPresentError).toHaveBeenCalledWith(error, {
      context: 'ReferenceUpload.cache',
      showToast: false,
    });
    expect(result).toEqual({
      ok: false,
      error,
      policy: 'degrade',
      errorCode: 'reference_optimistic_cache_update_failed',
      message: 'Failed to update cached reference selection',
      recoverable: true,
      cause: { context: 'ReferenceUpload.cache' },
    });
  });
});
