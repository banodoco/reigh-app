import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/shared/lib/errorUtils', () => ({
  isAbortError: (err: unknown) =>
    err instanceof Error &&
    (err.name === 'AbortError' || err.message.includes('aborted')),
}));

vi.mock('@/integrations/supabase/config/env', () => ({
  SUPABASE_URL: 'https://test-project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'anon-key',
}));

import { invokeWithTimeout } from '../invokeWithTimeout';

// Helper to create a mock Response
function mockResponse(body: unknown, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response;
}

describe('invokeWithTimeout', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
  });

  it('calls fetch and returns parsed JSON on success', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse({ result: 'ok' })
    );

    const result = await invokeWithTimeout('my-function', { body: { key: 'value' } });

    expect(result).toEqual({ result: 'ok' });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://test-project.supabase.co/functions/v1/my-function',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ key: 'value' }),
      })
    );
  });

  it('throws when response is not ok', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse('Function crashed', { ok: false, status: 500 })
    );

    await expect(invokeWithTimeout('failing-function')).rejects.toThrow('Function crashed');
  });

  it('uses default 20s timeout', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, opts: RequestInit) => {
        return new Promise((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        });
      }
    );

    const promise = invokeWithTimeout('slow-function').catch((e) => e);

    await vi.advanceTimersByTimeAsync(20001);

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain('timed out after 20000ms');
  });

  it('uses custom timeout', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, opts: RequestInit) => {
        return new Promise((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        });
      }
    );

    const promise = invokeWithTimeout('slow-function', { timeoutMs: 5000 }).catch((e) => e);

    await vi.advanceTimersByTimeAsync(5001);

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toContain('timed out after 5000ms');
  });

  it('passes custom headers to fetch', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse('ok')
    );

    await invokeWithTimeout('my-function', {
      headers: { 'X-Custom': 'header-value' },
    });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = callArgs[1].headers;
    expect(headers['X-Custom']).toBe('header-value');
  });

  it('passes an AbortSignal to fetch', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse('ok')
    );

    await invokeWithTimeout('my-function');

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[1].signal).toBeInstanceOf(AbortSignal);
  });

  it('throws non-abort errors directly', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Some random error')
    );

    await expect(invokeWithTimeout('bad-function')).rejects.toThrow('Some random error');
  });

  it('throws timeout message including function name', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, opts: RequestInit) => {
        return new Promise((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        });
      }
    );

    const promise = invokeWithTimeout('my-func', { timeoutMs: 3000 }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(3001);

    const result = await promise;
    expect(result).toBeInstanceOf(Error);
    expect(result.message).toBe('Function my-func timed out after 3000ms');
  });

  it('cleans up timeout on successful completion', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse('done')
    );

    await invokeWithTimeout('fast-function', { timeoutMs: 10000 });

    // The timeout should be cleared, so advancing past it should not cause issues
    await vi.advanceTimersByTimeAsync(15000);
  });

  it('handles error with empty text - uses fallback', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockResponse('', { ok: false, status: 500 })
    );

    await expect(invokeWithTimeout('empty-error-function')).rejects.toThrow(
      'Function empty-error-function failed with status 500'
    );
  });

  it('respects an external abort signal', async () => {
    const externalController = new AbortController();

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      (_url: string, opts: RequestInit) => {
        return new Promise((_resolve, reject) => {
          opts.signal?.addEventListener('abort', () => {
            const abortErr = new Error('The operation was aborted');
            abortErr.name = 'AbortError';
            reject(abortErr);
          });
        });
      }
    );

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
