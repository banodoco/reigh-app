import { act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { dispatchAppEvent } from '@/shared/lib/typedEvents';
import { useSettingsRouteIntent, useSettingsEventIntent } from './useSettingsModalIntents';

describe('useSettingsModalIntents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('parses route-state intent and clears history state after handling', () => {
    const onIntent = vi.fn();
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => undefined);

    renderHook(() =>
      useSettingsRouteIntent(
        {
          openSettings: true,
          settingsTab: 'account',
          creditsTab: 'history',
        },
        onIntent,
      ),
    );

    expect(onIntent).toHaveBeenCalledWith({
      settingsTab: 'account',
      creditsTab: 'history',
    });
    expect(replaceStateSpy).toHaveBeenCalledWith({}, document.title);
  });

  it('ignores invalid or closed route-state intent', () => {
    const onIntent = vi.fn();

    const { rerender } = renderHook(
      ({ state }) => useSettingsRouteIntent(state, onIntent),
      { initialProps: { state: null as unknown } },
    );

    rerender({ state: { openSettings: false, settingsTab: 'account' } as unknown });
    rerender({ state: { openSettings: true, settingsTab: 123 } as unknown });

    expect(onIntent).toHaveBeenCalledWith({ settingsTab: undefined, creditsTab: undefined });
    expect(onIntent).toHaveBeenCalledTimes(1);
  });

  it('handles openSettings app event intents', () => {
    const onIntent = vi.fn();

    renderHook(() => useSettingsEventIntent(onIntent));

    act(() => {
      dispatchAppEvent('openSettings', { tab: 'credits' });
      dispatchAppEvent('openSettings', {});
    });

    expect(onIntent).toHaveBeenNthCalledWith(1, { settingsTab: 'credits' });
    expect(onIntent).toHaveBeenNthCalledWith(2, { settingsTab: undefined });
  });
});
