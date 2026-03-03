import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reportError, reportAndRethrow } from './coreReporter';
import { normalizeAndLogError } from '@/shared/lib/errorHandling/normalizeAndLogError';
import { AppError } from './errors';

vi.mock('@/shared/lib/errorHandling/normalizeAndLogError', () => ({
  normalizeAndLogError: vi.fn(),
}));

describe('coreReporter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('normalizes/logs errors and invokes onError callback', () => {
    const appError = new AppError('normalized');
    vi.mocked(normalizeAndLogError).mockReturnValue(appError);
    const onError = vi.fn();

    const result = reportError(new Error('raw'), {
      context: 'core.report',
      logData: { key: 'value' },
      onError,
    });

    const [errorArg, optionsArg] = vi.mocked(normalizeAndLogError).mock.calls[0]!;
    expect(errorArg).toBeInstanceOf(Error);
    expect((errorArg as Error).message).toBe('raw');
    expect(optionsArg).toEqual({
      context: 'core.report',
      logData: { key: 'value' },
    });
    expect(onError).toHaveBeenCalledWith(appError);
    expect(result).toBe(appError);
  });

  it('rethrows normalized AppError', () => {
    const appError = new AppError('normalized throw');
    vi.mocked(normalizeAndLogError).mockReturnValue(appError);

    expect(() =>
      reportAndRethrow('raw', { context: 'core.throw' }),
    ).toThrow(appError);
  });
});
