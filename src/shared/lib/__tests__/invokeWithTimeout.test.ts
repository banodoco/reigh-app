import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock supabase
const mockInvoke = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => mockInvoke(...args),
    },
  },
}));

// Mock errorUtils
vi.mock('@/shared/lib/errorUtils', () => ({
  isAbortError: (err: unknown) =>
    err instanceof Error &&
    (err.name === 'AbortError' || err.message.includes('aborted')),
}));

import { invokeWithTimeout } from '../invokeWithTimeout';

describe('invokeWithTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('invokes the supabase function and returns data on success', async () => {
    mockInvoke.mockResolvedValue({ data: { result: 'ok' }, error: null });

    const result = await invokeWithTimeout('my-function', { body: { key: 'value' } });

    expect(result).toEqual({ result: 'ok' });
    expect(mockInvoke).toHaveBeenCalledWith(
      'my-function',
      expect.objectContaining({
        body: { key: 'value' },
      })
    );
  });

  it('throws when supabase returns an error object', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: 'Function crashed' },
    });

    await expect(invokeWithTimeout('failing-function')).rejects.toThrow('Function crashed');
  });

  it('uses default 20s timeout', async () => {
    mockInvoke.mockImplementation((_name: string, opts: any) => {
      return new Promise((resolve, reject) => {
        if (opts?.signal) {
          opts.signal.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        }
      });
    });

    // Immediately attach a catch handler before advancing timers
    const promise = invokeWithTimeout('slow-function').catch((e) => e);

    await vi.advanceTimersByTimeAsync(20001);

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain('timed out after 20000ms');
  });

  it('uses custom timeout', async () => {
    mockInvoke.mockImplementation((_name: string, opts: any) => {
      return new Promise((resolve, reject) => {
        if (opts?.signal) {
          opts.signal.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        }
      });
    });

    const promise = invokeWithTimeout('slow-function', { timeoutMs: 5000 }).catch((e) => e);

    await vi.advanceTimersByTimeAsync(5001);

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain('timed out after 5000ms');
  });

  it('passes headers to supabase invoke', async () => {
    mockInvoke.mockResolvedValue({ data: 'ok', error: null });

    await invokeWithTimeout('my-function', {
      headers: { 'X-Custom': 'header-value' },
    });

    expect(mockInvoke).toHaveBeenCalledWith(
      'my-function',
      expect.objectContaining({
        headers: { 'X-Custom': 'header-value' },
      })
    );
  });

  it('passes an AbortSignal to supabase invoke', async () => {
    mockInvoke.mockResolvedValue({ data: 'ok', error: null });

    await invokeWithTimeout('my-function');

    expect(mockInvoke).toHaveBeenCalledWith(
      'my-function',
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      })
    );
  });

  it('throws non-abort errors directly', async () => {
    mockInvoke.mockImplementation(() => Promise.reject(new Error('Some random error')));

    await expect(invokeWithTimeout('bad-function')).rejects.toThrow('Some random error');
  });

  it('throws timeout message including function name', async () => {
    mockInvoke.mockImplementation((_name: string, opts: any) => {
      return new Promise((resolve, reject) => {
        if (opts?.signal) {
          opts.signal.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        }
      });
    });

    const promise = invokeWithTimeout('my-func', { timeoutMs: 3000 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(3001);

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('Function my-func timed out after 3000ms');
  });

  it('cleans up timeout on successful completion', async () => {
    mockInvoke.mockResolvedValue({ data: 'done', error: null });

    await invokeWithTimeout('fast-function', { timeoutMs: 10000 });

    // The timeout should be cleared, so advancing past it should not cause issues
    await vi.advanceTimersByTimeAsync(15000);
  });

  it('handles error with empty message - uses fallback', async () => {
    mockInvoke.mockResolvedValue({
      data: null,
      error: { message: '' },
    });

    await expect(invokeWithTimeout('empty-error-function')).rejects.toThrow(
      'Function empty-error-function failed'
    );
  });

  it('respects an external abort signal', async () => {
    const externalController = new AbortController();

    mockInvoke.mockImplementation((_name: string, opts: any) => {
      return new Promise((resolve, reject) => {
        if (opts?.signal) {
          opts.signal.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        }
      });
    });

    const promise = invokeWithTimeout('my-function', {
      signal: externalController.signal,
      timeoutMs: 60000,
    }).catch((e) => e);

    // Abort externally
    externalController.abort();
    await vi.advanceTimersByTimeAsync(0);

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain('timed out');
  });
});
