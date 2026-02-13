import { describe, it, expect } from 'vitest';
import {
  AppError,
  NetworkError,
  AuthError,
  ValidationError,
  ServerError,
  SilentError,
  isAppError,
  isNetworkError,
  isAuthError,
  categorizeError,
} from '../errors';

describe('AppError', () => {
  it('creates with default options', () => {
    const err = new AppError('test error');
    expect(err.message).toBe('test error');
    expect(err.name).toBe('AppError');
    expect(err.showToast).toBe(true);
    expect(err.context).toBeUndefined();
    expect(err.cause).toBeUndefined();
  });

  it('creates with custom options', () => {
    const cause = new Error('original');
    const err = new AppError('test', {
      showToast: false,
      context: { foo: 'bar' },
      cause,
    });
    expect(err.showToast).toBe(false);
    expect(err.context).toEqual({ foo: 'bar' });
    expect(err.cause).toBe(cause);
  });

  it('is an instance of Error', () => {
    const err = new AppError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });
});

describe('NetworkError', () => {
  it('defaults to showToast true', () => {
    const err = new NetworkError('net error');
    expect(err.showToast).toBe(true);
    expect(err.name).toBe('NetworkError');
    expect(err.isTimeout).toBe(false);
  });

  it('sets isTimeout when specified', () => {
    const err = new NetworkError('timeout', { isTimeout: true });
    expect(err.isTimeout).toBe(true);
  });

  it('is an instance of AppError', () => {
    const err = new NetworkError('test');
    expect(err).toBeInstanceOf(AppError);
    expect(err).toBeInstanceOf(NetworkError);
  });

  describe('fromError', () => {
    it('creates timeout error from AbortError', () => {
      const original = new Error('aborted');
      original.name = 'AbortError';
      const err = NetworkError.fromError(original);
      expect(err.isTimeout).toBe(true);
      expect(err.cause).toBe(original);
    });

    it('creates timeout error from message containing "timeout"', () => {
      const original = new Error('request timeout occurred');
      const err = NetworkError.fromError(original);
      expect(err.isTimeout).toBe(true);
    });
  });
});

describe('AuthError', () => {
  it('defaults needsLogin to true', () => {
    const err = new AuthError('auth error');
    expect(err.name).toBe('AuthError');
    expect(err.needsLogin).toBe(true);
  });

  it('sets needsLogin from options', () => {
    const err = new AuthError('forbidden', { needsLogin: false });
    expect(err.needsLogin).toBe(false);
  });

  describe('fromError', () => {
    it('detects unauthorized as needsLogin', () => {
      const err = AuthError.fromError(new Error('Unauthorized'));
      expect(err.needsLogin).toBe(true);
      expect(err.message).toContain('log in');
    });

    it('detects permission errors as not needsLogin', () => {
      const err = AuthError.fromError(new Error('Forbidden action'));
      expect(err.needsLogin).toBe(false);
      expect(err.message).toContain('permission');
    });
  });
});

describe('ValidationError', () => {
  it('stores field name', () => {
    const err = new ValidationError('invalid input', { field: 'email' });
    expect(err.name).toBe('ValidationError');
    expect(err.field).toBe('email');
  });

  it('field is optional', () => {
    const err = new ValidationError('bad data');
    expect(err.field).toBeUndefined();
  });
});

describe('ServerError', () => {
  it('stores status code', () => {
    const err = new ServerError('internal error', { statusCode: 500 });
    expect(err.name).toBe('ServerError');
    expect(err.statusCode).toBe(500);
  });

  it('statusCode is optional', () => {
    const err = new ServerError('server error');
    expect(err.statusCode).toBeUndefined();
  });
});

describe('SilentError', () => {
  it('has showToast false by default', () => {
    const err = new SilentError('silent');
    expect(err.name).toBe('SilentError');
    expect(err.showToast).toBe(false);
  });
});

describe('type guards', () => {
  describe('isAppError', () => {
    it('returns true for AppError instances', () => {
      expect(isAppError(new AppError('test'))).toBe(true);
      expect(isAppError(new NetworkError('test'))).toBe(true);
      expect(isAppError(new AuthError('test'))).toBe(true);
      expect(isAppError(new ValidationError('test'))).toBe(true);
      expect(isAppError(new ServerError('test'))).toBe(true);
      expect(isAppError(new SilentError('test'))).toBe(true);
    });

    it('returns false for regular errors', () => {
      expect(isAppError(new Error('test'))).toBe(false);
      expect(isAppError(null)).toBe(false);
      expect(isAppError(undefined)).toBe(false);
      expect(isAppError('string error')).toBe(false);
    });
  });

  describe('isNetworkError', () => {
    it('returns true only for NetworkError', () => {
      expect(isNetworkError(new NetworkError('test'))).toBe(true);
      expect(isNetworkError(new AppError('test'))).toBe(false);
      expect(isNetworkError(new Error('test'))).toBe(false);
    });
  });

  describe('isAuthError', () => {
    it('returns true only for AuthError', () => {
      expect(isAuthError(new AuthError('test'))).toBe(true);
      expect(isAuthError(new AppError('test'))).toBe(false);
      expect(isAuthError(new Error('test'))).toBe(false);
    });
  });
});

describe('categorizeError', () => {
  it('returns AppError as-is', () => {
    const err = new AppError('test');
    expect(categorizeError(err)).toBe(err);
  });

  it('categorizes network-related errors', () => {
    const err = categorizeError(new Error('Failed to fetch'));
    expect(err).toBeInstanceOf(NetworkError);
  });

  it('categorizes timeout errors', () => {
    const err = categorizeError(new Error('Request timeout'));
    expect(err).toBeInstanceOf(NetworkError);
    expect((err as NetworkError).isTimeout).toBe(true);
  });

  it('categorizes abort errors', () => {
    const original = new Error('aborted');
    original.name = 'AbortError';
    const err = categorizeError(original);
    expect(err).toBeInstanceOf(NetworkError);
  });

  it('categorizes auth errors', () => {
    const err = categorizeError(new Error('Unauthorized'));
    expect(err).toBeInstanceOf(AuthError);
  });

  it('categorizes forbidden as auth error', () => {
    const err = categorizeError(new Error('forbidden'));
    expect(err).toBeInstanceOf(AuthError);
  });

  it('categorizes authentication required as auth error', () => {
    const err = categorizeError(new Error('Authentication required'));
    expect(err).toBeInstanceOf(AuthError);
  });

  it('categorizes validation errors', () => {
    const err = categorizeError(new Error('field is required'));
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('categorizes invalid input as validation error', () => {
    const err = categorizeError(new Error('Invalid email address'));
    expect(err).toBeInstanceOf(ValidationError);
  });

  it('defaults unknown errors to AppError', () => {
    const err = categorizeError(new Error('something went wrong'));
    expect(err).toBeInstanceOf(AppError);
    expect(err).not.toBeInstanceOf(NetworkError);
    expect(err).not.toBeInstanceOf(AuthError);
    expect(err).not.toBeInstanceOf(ValidationError);
  });

  it('converts non-Error values to AppError', () => {
    const err = categorizeError('string error');
    expect(err).toBeInstanceOf(AppError);
    expect(err.message).toBe('string error');
  });

  it('includes context when provided', () => {
    const ctx = { component: 'TestComponent' };
    const err = categorizeError(new Error('something'), ctx);
    expect(err.context).toEqual(ctx);
  });
});
