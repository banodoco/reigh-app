import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

// The stored choice: null follows the sky; a number is a fixed moment (0 midday … 1 midnight).
let storedTime: number | null = null;
let skyDarkness = 0;

vi.mock('@/shared/hooks/usePersistentState', () => ({
  usePersistentState: () => [storedTime, vi.fn()],
}));
vi.mock('@/pages/Home/publicAstridSkyRender', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/pages/Home/publicAstridSkyRender')>();
  return { ...actual, skyDarknessAt: () => skyDarkness };
});

import { useApplyDarkModeTheme } from '../useApplyDarkModeTheme';

describe('useApplyDarkModeTheme', () => {
  beforeEach(() => {
    storedTime = null;
    skyDarkness = 0;
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('style');
    document.querySelectorAll('link[rel="icon"]').forEach((node) => node.parentNode?.removeChild(node));
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.href = '/astrid-favicon.svg';
    document.head.appendChild(favicon);
  });

  it('follows the sky by default: dark at night, light by day, keeping the Astrid favicon', () => {
    skyDarkness = 1;
    const hook = renderHook(() => useApplyDarkModeTheme());
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    skyDarkness = 0;
    storedTime = 0; // the same as daylight, fixed
    hook.rerender();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect((document.querySelector('link[rel="icon"]') as HTMLLinkElement).href).toContain('astrid-favicon.svg');
  });

  it('holds a chosen night time even by day', () => {
    skyDarkness = 0;
    storedTime = 0.9;
    renderHook(() => useApplyDarkModeTheme());
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.getPropertyValue('--background')).not.toBe('');
  });
});
