import { describe, expect, it } from 'vitest';
import { CompletionError, toCompletionError } from './errors.ts';

describe('complete_task/errors', () => {
  it('wraps unknown errors into CompletionError', () => {
    const error = toCompletionError(new Error('inner failure'), {
      code: 'outer_code',
      context: 'outer_context',
      recoverable: true,
      message: 'outer message',
      metadata: { a: 1 },
    });

    expect(error).toBeInstanceOf(CompletionError);
    expect(error.code).toBe('outer_code');
    expect(error.context).toBe('outer_context');
    expect(error.message).toBe('outer message');
    expect(error.metadata).toMatchObject({
      a: 1,
      cause_message: 'inner failure',
    });
    expect(error.cause).toBeInstanceOf(Error);
  });

  it('re-wraps CompletionError with boundary context and preserves inner metadata', () => {
    const inner = new CompletionError({
      code: 'inner_code',
      context: 'inner_context',
      recoverable: false,
      message: 'inner message',
      metadata: { inner: true },
    });

    const wrapped = toCompletionError(inner, {
      code: 'outer_code',
      context: 'outer_context',
      recoverable: true,
      message: 'outer message',
      metadata: { outer: true },
    });

    expect(wrapped.code).toBe('outer_code');
    expect(wrapped.context).toBe('outer_context');
    expect(wrapped.message).toBe('outer message');
    expect(wrapped.metadata).toMatchObject({
      inner: true,
      outer: true,
      wrapped_error_code: 'inner_code',
      wrapped_error_context: 'inner_context',
      wrapped_error_recoverable: false,
      wrapped_error_message: 'inner message',
    });
    expect(wrapped.cause).toBe(inner);
  });
});
