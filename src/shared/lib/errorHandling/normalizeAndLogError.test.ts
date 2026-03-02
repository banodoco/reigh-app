import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from './errors';

const mocks = vi.hoisted(() => ({
  normalizeAppError: vi.fn(),
  logAppError: vi.fn(),
}));

vi.mock('@/shared/lib/errorHandling/errorNormalization', () => ({
  normalizeAppError: mocks.normalizeAppError,
}));

vi.mock('@/shared/lib/errorHandling/errorPresentation', () => ({
  logAppError: mocks.logAppError,
}));

import { normalizeAndLogError } from './normalizeAndLogError';

describe('normalizeAndLogError', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes the error, logs it, and returns the normalized value', () => {
    const normalized = new AppError('normalized');
    const inputError = new Error('boom');
    const options = { context: 'saveGeneration', logData: { id: 'gen-1' } };
    mocks.normalizeAppError.mockReturnValue(normalized);

    const result = normalizeAndLogError(inputError, options);

    expect(mocks.normalizeAppError).toHaveBeenCalledWith(inputError, options);
    expect(mocks.logAppError).toHaveBeenCalledWith('saveGeneration', normalized);
    expect(result).toBe(normalized);
  });
});
