import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the toast function
const mockToast = Object.assign(vi.fn(), {
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  info: vi.fn(),
});

// Mock navigator.onLine for NetworkError detection
Object.defineProperty(globalThis, 'navigator', {
  value: { onLine: true },
  writable: true,
  configurable: true,
});

import { handleError, AppError, NetworkError, AuthError, SilentError, isAppError, isAuthError, isNetworkError } from '../compat/errorHandler';
import { installErrorNotifier, resetErrorNotifierForTests } from '../errorHandling/errorNotifier';

describe('errorHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetErrorNotifierForTests();
    installErrorNotifier(({ title, description }) => {
      mockToast({
        title,
        description,
        variant: 'destructive',
      });
    }, 'test-suite');
    // Reset navigator.onLine to true
    Object.defineProperty(navigator, 'onLine', { value: true, writable: true, configurable: true });
  });

  describe('handleError', () => {
    it('returns a categorized AppError', () => {
      const result = handleError(new Error('something broke'), {
        context: 'TestContext',
      });

      expect(result).toBeInstanceOf(AppError);
    });

    it('preserves existing AppError instances', () => {
      const appError = new AppError('custom error', { showToast: false });
      const result = handleError(appError, { context: 'TestContext' });

      expect(result).toBe(appError);
      expect(result.message).toBe('custom error');
    });

    it('categorizes network errors correctly', () => {
      const fetchError = new Error('Failed to fetch');
      const result = handleError(fetchError, { context: 'NetworkTest' });

      expect(result).toBeInstanceOf(NetworkError);
    });

    it('categorizes auth errors correctly', () => {
      const authErr = new Error('unauthorized access');
      const result = handleError(authErr, { context: 'AuthTest' });

      expect(result).toBeInstanceOf(AuthError);
    });

    it('shows toast by default for non-silent errors', () => {
      handleError(new Error('visible error'), { context: 'ToastTest' });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: 'destructive',
        })
      );
    });

    it('does not show toast when showToast is false', () => {
      handleError(new Error('hidden error'), {
        context: 'NoToast',
        showToast: false,
      });

      expect(mockToast).not.toHaveBeenCalled();
    });

    it('does not show toast for SilentError', () => {
      const silent = new SilentError('quiet failure');
      handleError(silent, { context: 'SilentTest' });

      expect(mockToast).not.toHaveBeenCalled();
    });

    it('uses custom toast title when provided', () => {
      handleError(new Error('something happened'), {
        context: 'CustomTitle',
        toastTitle: 'My Custom Title',
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'My Custom Title',
        })
      );
    });

    it('uses default toast titles based on error type', () => {
      // Network error
      handleError(new Error('Failed to fetch resource'), {
        context: 'NetTitle',
      });
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Connection Error',
        })
      );
    });

    it('shows offline message for network errors when offline', () => {
      Object.defineProperty(navigator, 'onLine', { value: false, writable: true, configurable: true });

      handleError(new Error('network issue'), {
        context: 'OfflineTest',
      });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'You appear to be offline. Please check your connection.',
        })
      );
    });

    it('shows timeout message for timeout network errors', () => {
      const timeoutError = new NetworkError('timed out', { isTimeout: true });
      handleError(timeoutError, { context: 'TimeoutTest' });

      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Request timed out. Please try again.',
        })
      );
    });

    it('calls onError callback with the categorized error', () => {
      const onError = vi.fn();
      const result = handleError(new Error('callback test'), {
        context: 'Callback',
        onError,
      });

      expect(onError).toHaveBeenCalledWith(result);
    });

    it('handles non-Error objects', () => {
      const result = handleError('string error', { context: 'StringError' });

      expect(result).toBeInstanceOf(AppError);
      expect(result.message).toBe('string error');
    });

    it('handles undefined/null errors', () => {
      const result = handleError(undefined, { context: 'UndefinedError' });

      expect(result).toBeInstanceOf(AppError);
    });

    it('logs error details via console.error for non-silent errors', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      handleError(new Error('logged error'), { context: 'LogTest' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[LogTest]'),
        expect.any(String),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    it('does not log for SilentError', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      handleError(new SilentError('silent'), { context: 'SilentLog' });

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('re-exported type guards', () => {
    it('isAppError returns true for AppError instances', () => {
      expect(isAppError(new AppError('test'))).toBe(true);
      expect(isAppError(new NetworkError('test'))).toBe(true);
      expect(isAppError(new Error('test'))).toBe(false);
    });

    it('isNetworkError returns true only for NetworkError', () => {
      expect(isNetworkError(new NetworkError('test'))).toBe(true);
      expect(isNetworkError(new AppError('test'))).toBe(false);
    });

    it('isAuthError returns true only for AuthError', () => {
      expect(isAuthError(new AuthError('test'))).toBe(true);
      expect(isAuthError(new AppError('test'))).toBe(false);
    });
  });
});
