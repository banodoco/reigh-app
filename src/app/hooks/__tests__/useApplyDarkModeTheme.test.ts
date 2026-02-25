import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook } from '@testing-library/react';

let darkModeValue = true;

vi.mock('@/shared/hooks/usePersistentState', () => ({
  default: () => [darkModeValue, vi.fn()],
}));

import { useApplyDarkModeTheme } from '../useApplyDarkModeTheme';

describe('useApplyDarkModeTheme', () => {
  beforeEach(() => {
    darkModeValue = true;
    document.documentElement.classList.remove('dark');
    document
      .querySelectorAll('link[rel="icon"]')
      .forEach((node) => node.parentNode?.removeChild(node));
    const favicon = document.createElement('link');
    favicon.rel = 'icon';
    favicon.href = '/favicon.ico';
    document.head.appendChild(favicon);
  });

  it('applies dark class and dark favicon for dark mode', () => {
    renderHook(() => useApplyDarkModeTheme());

    const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(favicon?.href).toContain('favicon-dark.ico');
  });

  it('updates class and favicon when preference changes', () => {
    const hook = renderHook(() => useApplyDarkModeTheme());
    darkModeValue = false;
    hook.rerender();

    const favicon = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(favicon?.href).toContain('favicon-light.ico');
  });
});
