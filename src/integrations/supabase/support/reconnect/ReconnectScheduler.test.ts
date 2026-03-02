import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReconnectScheduler, getReconnectScheduler } from './ReconnectScheduler';

describe('ReconnectScheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces intents and dispatches the highest-priority reconnect event', async () => {
    const scheduler = new ReconnectScheduler();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    scheduler.requestReconnect({ source: 'visibility', reason: 'tab-visible', priority: 'low' });
    scheduler.requestReconnect({ source: 'auth', reason: 'signed-in', priority: 'high' });

    await vi.advanceTimersByTimeAsync(1000);

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0][0] as CustomEvent;
    expect(event.type).toBe('realtime:auth-heal');
    expect(event.detail.source).toBe('auth');
    expect(event.detail.coalescedSources).toEqual(expect.arrayContaining(['visibility', 'auth']));
  });

  it('enforces minimum reconnect interval before dispatching another event', async () => {
    const scheduler = new ReconnectScheduler();
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

    scheduler.requestReconnect({ source: 'auth', reason: 'first', priority: 'high' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    scheduler.requestReconnect({ source: 'auth', reason: 'second', priority: 'high' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(dispatchSpy).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(4000);
    expect(dispatchSpy).toHaveBeenCalledTimes(2);

    scheduler.destroy();
  });

  it('returns a singleton from getReconnectScheduler', () => {
    const first = getReconnectScheduler();
    const second = getReconnectScheduler();
    expect(first).toBe(second);
  });
});
