import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  categorizeError: vi.fn(),
}));

vi.mock('./errors', () => ({
  AppError: class MockAppError extends Error {},
  categorizeError: mocks.categorizeError,
}));

import { normalizeAppError } from './errorNormalization';

describe('normalizeAppError', () => {
  it('forwards context and log data to categorizeError', () => {
    const normalized = { message: 'normalized' };
    mocks.categorizeError.mockReturnValue(normalized);

    const error = new Error('boom');
    const result = normalizeAppError(error, {
      context: 'test-context',
      logData: { requestId: 'req-1' },
    });

    expect(mocks.categorizeError).toHaveBeenCalledWith(error, {
      context: 'test-context',
      requestId: 'req-1',
    });
    expect(result).toBe(normalized);
  });

  it('works when no log data is provided', () => {
    const normalized = { message: 'normalized-no-log' };
    mocks.categorizeError.mockReturnValue(normalized);

    const result = normalizeAppError('string error', {
      context: 'no-log-context',
    });

    expect(mocks.categorizeError).toHaveBeenCalledWith('string error', {
      context: 'no-log-context',
    });
    expect(result).toBe(normalized);
  });
});
