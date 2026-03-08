import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useState } from 'react';

vi.mock('../usePersistentState', () => {
  return {
    default: function usePersistentStateMock(_key: string, defaultValue: unknown) {
      return useState(defaultValue);
    },
  };
});

vi.mock('@/shared/components/ui/runtime/sonner', () => ({
  toast: { error: vi.fn(), warning: vi.fn() },
}));

import { useDarkMode } from './useDarkMode';

describe('useDarkMode', () => {
  let faviconLink: HTMLLinkElement;

  beforeEach(() => {
    document.documentElement.classList.remove('dark');
    // Set up a favicon link element
    faviconLink = document.createElement('link');
    faviconLink.rel = 'icon';
    faviconLink.href = '/favicon.ico';
    document.head.appendChild(faviconLink);
  });

  afterEach(() => {
    document.documentElement.classList.remove('dark');
    if (faviconLink && faviconLink.parentNode) {
      faviconLink.parentNode.removeChild(faviconLink);
    }
  });

  it('defaults to dark mode enabled', () => {
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.darkMode).toBe(true);
  });

  it('applies dark class to documentElement when dark mode is true', () => {
    renderHook(() => useDarkMode());
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes dark class when dark mode is false', () => {
    const { result } = renderHook(() => useDarkMode());

    act(() => {
      result.current.setDarkMode(false);
    });

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggle switches between dark and light', () => {
    const { result } = renderHook(() => useDarkMode());
    expect(result.current.darkMode).toBe(true);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.darkMode).toBe(false);

    act(() => {
      result.current.toggle();
    });
    expect(result.current.darkMode).toBe(true);
  });

  it('updates favicon for dark mode', () => {
    renderHook(() => useDarkMode());
    const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    expect(link.href).toContain('favicon-dark.ico');
  });

  it('updates favicon for light mode', () => {
    const { result } = renderHook(() => useDarkMode());

    act(() => {
      result.current.setDarkMode(false);
    });

    const link = document.querySelector('link[rel="icon"]') as HTMLLinkElement;
    expect(link.href).toContain('favicon-light.ico');
  });
});
