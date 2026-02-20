import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { composeAbortSignals, fetchWithTimeout } from './fetchWithTimeout';

describe('composeAbortSignals', () => {
  it('propagates caller abort to composed signal', () => {
    const timeoutController = new AbortController();
    const callerController = new AbortController();
    const { signal, cleanup } = composeAbortSignals(timeoutController.signal, callerController.signal);

    expect(signal.aborted).toBe(false);
    callerController.abort();

    expect(signal.aborted).toBe(true);
    cleanup();
  });

  it('returns an already-aborted composed signal when caller is pre-aborted', () => {
    const timeoutController = new AbortController();
    const callerController = new AbortController();
    callerController.abort();

    const { signal } = composeAbortSignals(timeoutController.signal, callerController.signal);
    expect(signal.aborted).toBe(true);
  });
});

describe('fetchWithTimeout', () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('passes through non-edge requests without timeout wrapper', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 200 }));
    const init: RequestInit = { method: 'GET' };

    await fetchWithTimeout('https://example.com/rest/v1/tasks', init);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith('https://example.com/rest/v1/tasks', init);
  });

  it('short-circuits pre-aborted caller signals for edge requests', async () => {
    const callerController = new AbortController();
    callerController.abort('cancelled by caller');

    await expect(
      fetchWithTimeout('https://example.com/functions/v1/create-task', {
        signal: callerController.signal,
      }),
    ).rejects.toBeDefined();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
