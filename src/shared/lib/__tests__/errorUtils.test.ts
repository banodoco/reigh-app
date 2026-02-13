import { describe, it, expect } from 'vitest';
import {
  isError,
  isErrorWithCode,
  isErrorWithStatus,
  getErrorMessage,
  isAbortError,
  isCancellationError,
} from '../errorUtils';

describe('isError', () => {
  it('returns true for Error instances', () => {
    expect(isError(new Error('test'))).toBe(true);
    expect(isError(new TypeError('test'))).toBe(true);
  });

  it('returns false for non-Error values', () => {
    expect(isError('string')).toBe(false);
    expect(isError(42)).toBe(false);
    expect(isError(null)).toBe(false);
    expect(isError(undefined)).toBe(false);
    expect(isError({ message: 'fake error' })).toBe(false);
  });
});

describe('isErrorWithCode', () => {
  it('returns true for errors with code property', () => {
    const err = Object.assign(new Error('test'), { code: 'ERR_TIMEOUT' });
    expect(isErrorWithCode(err)).toBe(true);
  });

  it('returns false for plain errors without code', () => {
    expect(isErrorWithCode(new Error('test'))).toBe(false);
  });

  it('returns false for non-Error objects with code', () => {
    expect(isErrorWithCode({ code: 'ERR', message: 'test' })).toBe(false);
  });
});

describe('isErrorWithStatus', () => {
  it('returns true for errors with numeric status', () => {
    const err = Object.assign(new Error('test'), { status: 404 });
    expect(isErrorWithStatus(err)).toBe(true);
  });

  it('returns false for errors without status', () => {
    expect(isErrorWithStatus(new Error('test'))).toBe(false);
  });

  it('returns false for errors with non-numeric status', () => {
    const err = Object.assign(new Error('test'), { status: 'not found' });
    expect(isErrorWithStatus(err)).toBe(false);
  });
});

describe('getErrorMessage', () => {
  it('extracts message from Error instances', () => {
    expect(getErrorMessage(new Error('something broke'))).toBe('something broke');
  });

  it('returns strings directly', () => {
    expect(getErrorMessage('direct error message')).toBe('direct error message');
  });

  it('converts other types with String()', () => {
    expect(getErrorMessage(42)).toBe('42');
    expect(getErrorMessage(null)).toBe('null');
    expect(getErrorMessage(undefined)).toBe('undefined');
  });

  it('converts objects with String()', () => {
    expect(getErrorMessage({ code: 123 })).toBe('[object Object]');
  });
});

describe('isAbortError', () => {
  it('returns true for Error with name AbortError', () => {
    const err = new Error('The operation was aborted');
    err.name = 'AbortError';
    expect(isAbortError(err)).toBe(true);
  });

  it('returns false for other errors', () => {
    expect(isAbortError(new Error('test'))).toBe(false);
    expect(isAbortError(new TypeError('test'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isAbortError('AbortError')).toBe(false);
    expect(isAbortError(null)).toBe(false);
  });
});

describe('isCancellationError', () => {
  it('returns true for AbortError', () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    expect(isCancellationError(err)).toBe(true);
  });

  it('returns true for "Request was cancelled" message', () => {
    expect(isCancellationError(new Error('Request was cancelled by user'))).toBe(true);
  });

  it('returns true for "signal is aborted" message', () => {
    expect(isCancellationError(new Error('The signal is aborted'))).toBe(true);
  });

  it('returns false for regular errors', () => {
    expect(isCancellationError(new Error('network error'))).toBe(false);
  });

  it('returns false for non-Error values', () => {
    expect(isCancellationError('cancelled')).toBe(false);
    expect(isCancellationError(null)).toBe(false);
  });
});
