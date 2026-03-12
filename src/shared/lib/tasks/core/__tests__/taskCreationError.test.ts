import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskValidationError } from '@/shared/lib/taskCreation';
import { rethrowTaskCreationError } from '../taskCreationError';

const handleErrorMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/lib/errorHandling/runtimeError', () => ({
  normalizeAndPresentError: handleErrorMock,
}));

describe('rethrowTaskCreationError', () => {
  beforeEach(() => {
    handleErrorMock.mockReset();
  });

  it('rethrows task validation errors unchanged', () => {
    const validationError = new TaskValidationError('invalid payload', 'prompt');

    expect(() =>
      rethrowTaskCreationError(validationError, { context: 'TaskCreation' }),
    ).toThrow(validationError);
    expect(handleErrorMock).not.toHaveBeenCalled();
  });

  it('normalizes non-validation errors through normalizeAndPresentError', () => {
    const runtimeError = new Error('runtime failure');
    const normalizedError = new Error('normalized');
    handleErrorMock.mockReturnValueOnce(normalizedError);

    expect(() =>
      rethrowTaskCreationError(runtimeError, { context: 'TaskCreation' }),
    ).toThrow(normalizedError);
    expect(handleErrorMock).toHaveBeenCalledWith(runtimeError, {
      context: 'TaskCreation',
      showToast: false,
    });
  });
});
