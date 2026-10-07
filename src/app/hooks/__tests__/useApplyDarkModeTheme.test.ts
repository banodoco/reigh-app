import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// The stored choice: null follows the sky; a number is a fixed time, in hours from midnight.
let storedTime: number | null = null;

vi.mock('@/shared/hooks/usePersistentState', () => ({
  usePersistentState: () => [storedTime, vi.fn()],
}));
vi.mock('@/pages/Home/publicAstridSkyRender', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/pages/Home/publicAstridSkyRender')>();
  // A simple sky: light from 7am to 7pm, dark otherwise.
  return { ...actual, skyDarknessAt: (at: Date) => (at.getHours() >= 7 && at.getHours() < 19 ? 0 : 1) };
});

import { useApplyDarkModeTheme } from '../useApplyDarkModeTheme';

describe('useApplyDarkModeTheme', () => {
  afterEach(() => vi.useRealTimers());

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 3, 12, 0));
    storedTime = null;
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('style');
    document.querySelectorAll('link[rel="icon"]').forEach((node) => node.parentNode?.removeChild(node));
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.href = '/astrid-favicon.svg';
    document.head.appendChild(favicon);
  });

  it('follows the sky by default: dark at night, light by day, keeping the Astrid favicon', () => {
    vi.setSystemTime(new Date(2026, 9, 3, 23, 0));
    const hook = renderHook(() => useApplyDarkModeTheme());
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    storedTime = 12; // midday, fixed
    hook.rerender();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect((document.querySelector('link[rel="icon"]') as HTMLLinkElement).href).toContain('astrid-favicon.svg');
  });

  it('holds a chosen night time even by day', () => {
    storedTime = 22;
    renderHook(() => useApplyDarkModeTheme());
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--background')).not.toBe('');
  });
});
