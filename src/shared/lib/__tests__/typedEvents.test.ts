import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dispatchAppEvent, listenAppEvent, useAppEventListener } from '../typedEvents';

describe('typedEvents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dispatches typed custom events with detail payloads', () => {
    const listener = vi.fn();
    window.addEventListener('openSettings', listener);

    dispatchAppEvent('openSettings', { tab: 'credits' });

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent<{ tab?: string }>;
    expect(event.detail).toEqual({ tab: 'credits' });

    window.removeEventListener('openSettings', listener);
  });

  it('dispatches void events without requiring detail', () => {
    const listener = vi.fn();
    window.addEventListener('openGenerationsPane', listener);

    dispatchAppEvent('openGenerationsPane');

    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0] as CustomEvent<void>;
    expect(event.detail).toBeNull();

    window.removeEventListener('openGenerationsPane', listener);
  });

  it('listenAppEvent returns an unsubscribe that removes the listener', () => {
    const handler = vi.fn();
    const unsubscribe = listenAppEvent('mobileSelectionActive', handler);

    dispatchAppEvent('mobileSelectionActive', true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenLastCalledWith(true);

    unsubscribe();
    dispatchAppEvent('mobileSelectionActive', false);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('useAppEventListener wires and cleans up listeners across rerenders/unmount', () => {
    const firstHandler = vi.fn();
    const secondHandler = vi.fn();

    const { rerender, unmount } = renderHook(
      ({ handler }: { handler: (detail: { tab?: string }) => void }) =>
        useAppEventListener('openSettings', handler),
      { initialProps: { handler: firstHandler } }
    );

    act(() => {
      dispatchAppEvent('openSettings', { tab: 'first' });
    });
    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(firstHandler).toHaveBeenLastCalledWith({ tab: 'first' });

    rerender({ handler: secondHandler });
    act(() => {
      dispatchAppEvent('openSettings', { tab: 'second' });
    });
    expect(firstHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenCalledTimes(1);
    expect(secondHandler).toHaveBeenLastCalledWith({ tab: 'second' });

    unmount();
    act(() => {
      dispatchAppEvent('openSettings', { tab: 'after-unmount' });
    });
    expect(secondHandler).toHaveBeenCalledTimes(1);
  });
});
