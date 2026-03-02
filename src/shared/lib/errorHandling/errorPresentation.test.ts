import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError, NetworkError, SilentError } from './errors';
import { getErrorDescription, getErrorTitle, logAppError } from './errorPresentation';

describe('errorPresentation', () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses override or mapped/default titles', () => {
    const appError = new AppError('base');
    const networkError = new NetworkError('network');

    expect(getErrorTitle(networkError)).toBe('Connection Error');
    expect(getErrorTitle(appError)).toBe('Error');
    expect(getErrorTitle(appError, 'Custom title')).toBe('Custom title');
  });

  it('builds user-facing descriptions for network states', () => {
    const offlineError = new NetworkError('offline message', { isOffline: true });
    const timeoutError = new NetworkError('timeout message', { isTimeout: true });
    const appError = new AppError('generic message');

    expect(getErrorDescription(offlineError)).toBe('You appear to be offline. Please check your connection.');
    expect(getErrorDescription(timeoutError)).toBe('Request timed out. Please try again.');
    expect(getErrorDescription(appError)).toBe('generic message');
  });

  it('logs non-silent errors with context data', () => {
    const cause = new Error('root-cause');
    const appError = new AppError('failed to save', {
      cause,
      context: { requestId: 'req-1' },
    });

    logAppError('saveSettings', appError);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[saveSettings] AppError:',
      'failed to save',
      expect.objectContaining({
        errorType: 'AppError',
        cause: 'root-cause',
        requestId: 'req-1',
      }),
    );
  });

  it('does not log silent errors', () => {
    const silentError = new SilentError('cache miss');

    logAppError('loadCache', silentError);

    expect(consoleErrorSpy).not.toHaveBeenCalled();
  });
});
