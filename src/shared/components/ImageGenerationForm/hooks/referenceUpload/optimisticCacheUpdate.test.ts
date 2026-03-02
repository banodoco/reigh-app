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

    runOptimisticCacheUpdate(operation, 'cache.context');

    expect(operation).toHaveBeenCalledTimes(1);
    expect(normalizeAndPresentError).not.toHaveBeenCalled();
  });

  it('normalizes and reports errors without throwing', () => {
    const error = new Error('update failed');
    const operation = vi.fn(() => {
      throw error;
    });

    expect(() => runOptimisticCacheUpdate(operation, 'cache.context')).not.toThrow();
    expect(normalizeAndPresentError).toHaveBeenCalledWith(error, {
      context: 'cache.context',
      showToast: false,
    });
  });
});
