import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDeviceInfo } from './responsiveViewModel';

const mocks = vi.hoisted(() => ({
  useIsMobile: vi.fn(),
  useIsTablet: vi.fn(),
  useIsTouchDevice: vi.fn(),
}));

vi.mock('./deviceSignals', () => ({
  useIsMobile: mocks.useIsMobile,
  useIsTablet: mocks.useIsTablet,
  useIsTouchDevice: mocks.useIsTouchDevice,
}));

vi.mock('./mobileErrorReporter', () => ({
  reportNonFatalMobileError: vi.fn(),
}));

describe('useDeviceInfo', () => {
  let orientationMatches = false;
  let orientationHandlers = new Set<() => void>();

  beforeEach(() => {
    vi.clearAllMocks();
    orientationMatches = false;
    orientationHandlers = new Set();

    Object.defineProperty(window, 'innerWidth', { value: 1200, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true, configurable: true });

    mocks.useIsMobile.mockReturnValue(false);
    mocks.useIsTablet.mockReturnValue(false);
    mocks.useIsTouchDevice.mockReturnValue(false);

    window.matchMedia = vi.fn((query: string) => {
      const isOrientationQuery = query === '(orientation: portrait)';
      return {
        get matches() {
          return isOrientationQuery ? orientationMatches : false;
        },
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn((event: string, handler: () => void) => {
          if (isOrientationQuery && event === 'change') {
            orientationHandlers.add(handler);
          }
        }),
        removeEventListener: vi.fn((event: string, handler: () => void) => {
          if (isOrientationQuery && event === 'change') {
            orientationHandlers.delete(handler);
          }
        }),
        dispatchEvent: vi.fn(),
      };
    }) as unknown as typeof window.matchMedia;
  });

  it('returns desktop defaults when not on mobile', () => {
    const { result } = renderHook(() => useDeviceInfo());

    expect(result.current.isPhone).toBe(false);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isTabletOrLarger).toBe(true);
    expect(result.current.isTouchDevice).toBe(false);
    expect(result.current.orientation).toBe('landscape');
    expect(result.current.isPortraitMode).toBe(false);
    expect(result.current.mobileColumns).toBe(6);
  });

  it('switches to tablet column policy when orientation changes', () => {
    orientationMatches = true;
    mocks.useIsMobile.mockReturnValue(true);
    mocks.useIsTablet.mockReturnValue(true);
    mocks.useIsTouchDevice.mockReturnValue(true);

    const { result } = renderHook(() => useDeviceInfo());

    expect(result.current.mobileColumns).toBe(3);
    expect(result.current.orientation).toBe('portrait');

    act(() => {
      orientationMatches = false;
      for (const handler of orientationHandlers) handler();
    });

    expect(result.current.mobileColumns).toBe(4);
    expect(result.current.orientation).toBe('landscape');
  });

  it('updates size-derived fields on resize', () => {
    const { result } = renderHook(() => useDeviceInfo());

    expect(result.current.isTabletOrLarger).toBe(true);
    expect(result.current.isPortraitMode).toBe(false);

    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 600, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 900, writable: true, configurable: true });
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.isTabletOrLarger).toBe(false);
    expect(result.current.isPortraitMode).toBe(true);
  });
});
