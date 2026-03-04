import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runOptimisticCacheUpdate } from './optimisticCacheUpdate';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: vi.fn(),
}));

describe('runOptimisticCacheUpdate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('runs operation without reporting when successful', () => {
    const operation = vi.fn();

    const result = runOptimisticCacheUpdate(operation, 'cache.context');

    expect(operation).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(true);
    expect(normalizeAndPresentError).not.toHaveBeenCalled();
  });

  it('normalizes and reports errors and returns a failure result', () => {
    const error = new Error('update failed');
    const operation = vi.fn(() => {
      throw error;
    });

    const result = runOptimisticCacheUpdate(operation, 'cache.context');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errorCode).toBe('reference_optimistic_cache_update_failed');
      expect(result.message).toBe('Failed to update cached reference selection');
    }
    expect(normalizeAndPresentError).toHaveBeenCalledWith(error, {
      context: 'cache.context',
      showToast: false,
    });
  });
});
