import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ErrorInfo } from 'react';
import { reportErrorBoundaryCatch, reportRecoverableError } from './recoverableError';

const normalizeAndPresentErrorMock = vi.fn();

vi.mock('./handleError', () => ({
  normalizeAndPresentError: (...args: unknown[]) => normalizeAndPresentErrorMock(...args),
}));

describe('recoverableError', () => {
  beforeEach(() => {
    normalizeAndPresentErrorMock.mockReset();
  });

  it('reports recoverable errors without toasts', () => {
    reportRecoverableError(new Error('boom'), {
      context: 'test.context',
      logData: { foo: 'bar' },
    });

    expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'test.context',
        showToast: false,
        logData: { foo: 'bar' },
      }),
    );
  });

  it('captures trimmed boundary metadata', () => {
    reportErrorBoundaryCatch({
      context: 'boundary.context',
      error: new Error('render failure'),
      errorInfo: { componentStack: '\nA\nB\nC\nD\nE\nF\nG\nH\nI\nJ\nK' } as ErrorInfo,
      recoveryAction: 'fallback',
    });

    expect(normalizeAndPresentErrorMock).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        context: 'boundary.context',
        showToast: false,
      }),
    );
  });
});
