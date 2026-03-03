import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isMobileUA, useIsMobile, useIsTablet, useIsTouchDevice } from './deviceSignals';

const mocks = vi.hoisted(() => ({
  computeIsMobile: vi.fn(),
  computeIsTablet: vi.fn(),
  computeIsTouchDevice: vi.fn(),
  isMobileUA: vi.fn(),
  reportNonFatalMobileError: vi.fn(),
}));

vi.mock('./deviceDetection', () => ({
  MOBILE_BREAKPOINT: 768,
  computeIsMobile: mocks.computeIsMobile,
  computeIsTablet: mocks.computeIsTablet,
  computeIsTouchDevice: mocks.computeIsTouchDevice,
  isMobileUA: mocks.isMobileUA,
}));

vi.mock('./mobileErrorReporter', () => ({
  reportNonFatalMobileError: mocks.reportNonFatalMobileError,
}));

describe('deviceSignals', () => {
  const listeners = new Map<string, Set<() => void>>();

  beforeEach(() => {
    vi.clearAllMocks();
    listeners.clear();
    window.matchMedia = vi.fn((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((event: string, handler: () => void) => {
        if (event !== 'change') return;
        if (!listeners.has(query)) listeners.set(query, new Set());
        listeners.get(query)?.add(handler);
      }),
      removeEventListener: vi.fn((event: string, handler: () => void) => {
        if (event !== 'change') return;
        listeners.get(query)?.delete(handler);
      }),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;
  });

  it('re-exports isMobileUA from deviceDetection', () => {
    mocks.isMobileUA.mockReturnValue(true);
    expect(isMobileUA()).toBe(true);
    expect(mocks.isMobileUA).toHaveBeenCalledTimes(1);
  });

  it('updates useIsMobile on media-query and resize changes', () => {
    mocks.computeIsMobile
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      const widthHandlers = listeners.get('(max-width: 767px)');
      for (const handler of widthHandlers ?? []) handler();
    });
    expect(result.current).toBe(true);

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(mocks.computeIsMobile).toHaveBeenCalled();
    expect(mocks.computeIsMobile).toHaveBeenLastCalledWith(mocks.reportNonFatalMobileError);
  });

  it('updates useIsTablet on resize', () => {
    mocks.computeIsTablet
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    const { result } = renderHook(() => useIsTablet());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(true);
    expect(mocks.computeIsTablet).toHaveBeenLastCalledWith(mocks.reportNonFatalMobileError);
  });

  it('updates useIsTouchDevice on resize', () => {
    mocks.computeIsTouchDevice
      .mockReturnValueOnce(false)
      .mockReturnValue(true);

    const { result } = renderHook(() => useIsTouchDevice());
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(result.current).toBe(true);
    expect(mocks.computeIsTouchDevice).toHaveBeenLastCalledWith(mocks.reportNonFatalMobileError);
  });
});
