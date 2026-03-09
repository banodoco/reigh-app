// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isMobileUA,
  useIsMobile,
  useIsTablet,
  useIsTouchDevice,
} from './deviceSignals';

const mocks = vi.hoisted(() => ({
  computeIsMobile: vi.fn(),
  computeIsTablet: vi.fn(),
  computeIsTouchDevice: vi.fn(),
  isMobileUA: vi.fn(),
  reportNonFatalMobileError: vi.fn(),
}));

vi.mock('./deviceDetection', () => ({
  MOBILE_BREAKPOINT: 768,
  computeIsMobile: (...args: unknown[]) => mocks.computeIsMobile(...args),
  computeIsTablet: (...args: unknown[]) => mocks.computeIsTablet(...args),
  computeIsTouchDevice: (...args: unknown[]) => mocks.computeIsTouchDevice(...args),
  isMobileUA: (...args: unknown[]) => mocks.isMobileUA(...args),
}));

vi.mock('./mobileErrorReporter', () => ({
  reportNonFatalMobileError: (...args: unknown[]) =>
    mocks.reportNonFatalMobileError(...args),
}));

describe('deviceSignals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const listeners = new Map<string, Set<(event: Event) => void>>();
    window.matchMedia = vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: (type: string, listener: (event: Event) => void) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)?.add(listener);
      },
      removeEventListener: (type: string, listener: (event: Event) => void) => {
        listeners.get(type)?.delete(listener);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: (event: Event) => {
        listeners.get(event.type)?.forEach((listener) => listener(event));
        return true;
      },
    }));
  });

  it('updates mobile state on resize using the shared error reporter', () => {
    mocks.computeIsMobile.mockReturnValueOnce(false).mockReturnValue(true);
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
    expect(mocks.computeIsMobile).toHaveBeenCalledWith(expect.any(Function));

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current).toBe(true);
  });

  it('updates tablet and touch state on resize', () => {
    mocks.computeIsTablet.mockReturnValueOnce(false).mockReturnValue(true);
    mocks.computeIsTouchDevice.mockReturnValueOnce(false).mockReturnValue(true);

    const tabletHook = renderHook(() => useIsTablet());
    const touchHook = renderHook(() => useIsTouchDevice());

    expect(tabletHook.result.current).toBe(false);
    expect(touchHook.result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(tabletHook.result.current).toBe(true);
    expect(touchHook.result.current).toBe(true);
  });

  it('re-exports the user-agent helper', () => {
    mocks.isMobileUA.mockReturnValue(true);
    expect(isMobileUA()).toBe(true);
  });
});
