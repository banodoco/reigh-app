import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';

vi.mock('../usePersistentState', () => {
  return {
    usePersistentState: function usePersistentStateMock(_key: string, defaultValue: unknown) {
      return useState(defaultValue);
    },
  };
});

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn() },
}));

// A simple sky: light from 7am to 7pm, dark otherwise.
vi.mock('@/pages/Home/publicAstridSkyRender', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/pages/Home/publicAstridSkyRender')>();
  return { ...actual, skyDarknessAt: (at: Date) => (at.getHours() >= 7 && at.getHours() < 19 ? 0 : 1) };
});
const setNow = (hour: number) => vi.setSystemTime(new Date(2026, 9, 3, hour, 0));

import { useDarkMode } from './useDarkMode';
import { useAppTheme, useApplyAppTheme } from './useAppTheme';

describe('the app theme', () => {
  let faviconLink: HTMLLinkElement;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    setNow(12);
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('style');
    faviconLink = document.createElement('link');
    faviconLink.rel = 'icon';
    faviconLink.href = '/astrid-favicon.svg';
    document.head.appendChild(faviconLink);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('style');
    faviconLink.parentNode?.removeChild(faviconLink);
  });

  it('follows the time of day until a time is chosen, showing the time now on the clock', () => {
    setNow(23);
    const night = renderHook(() => useAppTheme());
    expect(night.result.current.followsSky).toBe(true);
    expect(night.result.current.darkMode).toBe(true);
    expect(night.result.current.hours).toBe(23);

    setNow(9);
    const day = renderHook(() => useAppTheme());
    expect(day.result.current.followsSky).toBe(true);
    expect(day.result.current.darkMode).toBe(false);
  });

  it('keeps the sky of a chosen time whatever the time now, and can go back to following it', () => {
    setNow(12);
    const { result } = renderHook(() => useAppTheme());
    act(() => result.current.setTime(22));
    expect(result.current.followsSky).toBe(false);
    expect(result.current.hours).toBe(22);
    expect(result.current.darkMode).toBe(true);

    act(() => result.current.followSky());
    expect(result.current.followsSky).toBe(true);
    expect(result.current.darkMode).toBe(false);
  });

  it('paints the page in Astrid\'s palette, with the dark class and the browser colour, keeping the favicon', () => {
    setNow(23);
    renderHook(() => useApplyAppTheme());
    const root = document.documentElement;
    expect(root.classList.contains('dark')).toBe(true);
    // Astrid's night paper and ink.
    expect(root.style.getPropertyValue('--background')).toBe('30 11% 7%');
    expect(root.style.getPropertyValue('--foreground')).toBe('40 30% 93%');
    expect(root.style.getPropertyValue('--wes-pink')).not.toBe('');
    expect(document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')).not.toBeNull();
    expect((document.querySelector('link[rel="icon"]') as HTMLLinkElement).href).toContain('astrid-favicon.svg');
  });

  it('useDarkMode reads the theme, and setting it fixes a day or night time', () => {
    setNow(12);
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.darkMode).toBe(false);

    act(() => result.current.toggle());
    expect(result.current.darkMode).toBe(true);

    act(() => result.current.setDarkMode(false));
    expect(result.current.darkMode).toBe(false);
  });
});
