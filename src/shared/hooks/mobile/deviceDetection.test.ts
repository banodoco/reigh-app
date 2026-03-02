import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MOBILE_BREAKPOINT,
  computeIsTablet,
  computeIsMobile,
  computeIsTouchDevice,
  computeOrientation,
  computeIsPortraitMode,
  isMobileUA,
} from './deviceDetection';

function setNavigator(overrides: Partial<Navigator>) {
  Object.defineProperty(window, 'navigator', {
    value: {
      ...window.navigator,
      ...overrides,
    },
    configurable: true,
  });
}

describe('deviceDetection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
    setNavigator({
      userAgent: 'Mozilla/5.0',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    } as Navigator);
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(pointer: coarse)' || query === '(orientation: portrait)' ? false : false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
  });

  it('computes tablet/mobile/touch from width, pointer, and iPadOS-like traits', () => {
    Object.defineProperty(window, 'innerWidth', { value: 900, writable: true, configurable: true });
    setNavigator({ platform: 'MacIntel', maxTouchPoints: 2 } as Navigator);

    expect(MOBILE_BREAKPOINT).toBe(768);
    expect(computeIsTablet()).toBe(true);
    expect(computeIsMobile()).toBe(true);
    expect(computeIsTouchDevice()).toBe(true);
  });

  it('reports errors through callback when matchMedia access throws', () => {
    const onError = vi.fn();
    window.matchMedia = vi.fn(() => {
      throw new Error('matchMedia unavailable');
    });

    expect(computeOrientation(onError)).toBe('portrait');
    expect(computeIsMobile(onError)).toBe(false);
    expect(onError).toHaveBeenCalledWith('computeOrientation', expect.any(Error));
    expect(onError).toHaveBeenCalledWith('hasCoarsePointer', expect.any(Error));
  });

  it('detects portrait mode and mobile user agents', () => {
    Object.defineProperty(window, 'innerWidth', { value: 600, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 900, writable: true, configurable: true });
    setNavigator({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' } as Navigator);

    expect(computeIsPortraitMode()).toBe(true);
    expect(isMobileUA()).toBe(true);
  });
});
