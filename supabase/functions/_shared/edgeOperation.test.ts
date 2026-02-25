import { describe, expect, it } from 'vitest';
import { operationFailure, operationSuccess } from './edgeOperation.ts';

describe('edgeOperation', () => {
  it('returns a default success envelope', () => {
    const result = operationSuccess({ ok: true });

    expect(result).toEqual({
      ok: true,
      policy: 'best_effort',
      recoverable: false,
      value: { ok: true },
    });
  });

  it('normalizes unknown errors into structured failures', () => {
    const result = operationFailure('bad input', {
      errorCode: 'bad_input',
      message: 'Input is invalid',
      policy: 'fail_closed',
      recoverable: false,
      cause: { field: 'name' },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected failure');
    }
    expect(result.error).toBeInstanceOf(Error);
    expect(result.errorCode).toBe('bad_input');
    expect(result.message).toBe('Input is invalid');
    expect(result.policy).toBe('fail_closed');
    expect(result.recoverable).toBe(false);
    expect(result.cause).toEqual({ field: 'name' });
  });
});
