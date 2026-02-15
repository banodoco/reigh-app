import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { isMobileUA, useIsMobile, useIsTablet, useIsTouchDevice, useDeviceInfo } from '../use-mobile';

// Store original globals
const originalMatchMedia = window.matchMedia;
const originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight');
const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
const originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform');
const originalMaxTouchPoints = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');

function setWindowSize(width: number, height: number = 800) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true, writable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true, writable: true });
}

function setUserAgent(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true, writable: true });
}

function setPlatform(platform: string) {
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true, writable: true });
}

function setMaxTouchPoints(points: number) {
  Object.defineProperty(navigator, 'maxTouchPoints', { value: points, configurable: true, writable: true });
}

describe('isMobileUA', () => {
  afterEach(() => {
    if (originalUserAgent) {
      Object.defineProperty(navigator, 'userAgent', originalUserAgent);
    }
  });

  it('returns true for iPhone UA', () => {
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)');
    expect(isMobileUA()).toBe(true);
  });

  it('returns true for Android UA', () => {
    setUserAgent('Mozilla/5.0 (Linux; Android 13)');
    expect(isMobileUA()).toBe(true);
  });

  it('returns true for iPad UA', () => {
    setUserAgent('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)');
    expect(isMobileUA()).toBe(true);
  });

  it('returns false for desktop UA', () => {
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    expect(isMobileUA()).toBe(false);
  });
});

describe('useIsMobile', () => {
  let listeners: Record<string, Set<(...args: unknown[]) => void>>;

  beforeEach(() => {
    listeners = {};
    setWindowSize(1024);
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    setPlatform('MacIntel');
    setMaxTouchPoints(0);

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn((_event: string, handler: () => void) => {
        if (!listeners[query]) listeners[query] = new Set();
        listeners[query].add(handler);
      }),
      removeEventListener: vi.fn((_event: string, handler: () => void) => {
        listeners[query]?.delete(handler);
      }),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    if (originalInnerWidth) Object.defineProperty(window, 'innerWidth', originalInnerWidth);
    if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight);
    if (originalUserAgent) Object.defineProperty(navigator, 'userAgent', originalUserAgent);
    if (originalPlatform) Object.defineProperty(navigator, 'platform', originalPlatform);
    if (originalMaxTouchPoints) Object.defineProperty(navigator, 'maxTouchPoints', originalMaxTouchPoints);
  });

  it('returns false for desktop viewport', () => {
    setWindowSize(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);
  });

  it('returns true for mobile viewport', () => {
    setWindowSize(375);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(true);
  });

  it('updates on resize', () => {
    setWindowSize(1024);
    const { result } = renderHook(() => useIsMobile());
    expect(result.current).toBe(false);

    act(() => {
      setWindowSize(375);
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current).toBe(true);
  });
});

describe('useIsTablet', () => {
  beforeEach(() => {
    setWindowSize(1024);
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    setPlatform('MacIntel');
    setMaxTouchPoints(0);

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    if (originalInnerWidth) Object.defineProperty(window, 'innerWidth', originalInnerWidth);
    if (originalUserAgent) Object.defineProperty(navigator, 'userAgent', originalUserAgent);
    if (originalPlatform) Object.defineProperty(navigator, 'platform', originalPlatform);
    if (originalMaxTouchPoints) Object.defineProperty(navigator, 'maxTouchPoints', originalMaxTouchPoints);
  });

  it('returns false for desktop', () => {
    setWindowSize(1400);
    const { result } = renderHook(() => useIsTablet());
    expect(result.current).toBe(false);
  });

  it('detects iPadOS via MacIntel + touch', () => {
    setPlatform('MacIntel');
    setMaxTouchPoints(5);
    const { result } = renderHook(() => useIsTablet());
    expect(result.current).toBe(true);
  });

  it('detects iPad via user agent', () => {
    setUserAgent('Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)');
    const { result } = renderHook(() => useIsTablet());
    expect(result.current).toBe(true);
  });
});

describe('useIsTouchDevice', () => {
  beforeEach(() => {
    setWindowSize(1024);
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    setPlatform('MacIntel');
    setMaxTouchPoints(0);

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    if (originalMaxTouchPoints) Object.defineProperty(navigator, 'maxTouchPoints', originalMaxTouchPoints);
    if (originalUserAgent) Object.defineProperty(navigator, 'userAgent', originalUserAgent);
    if (originalPlatform) Object.defineProperty(navigator, 'platform', originalPlatform);
  });

  it('returns false for non-touch desktop', () => {
    const { result } = renderHook(() => useIsTouchDevice());
    expect(result.current).toBe(false);
  });

  it('returns true when maxTouchPoints > 0', () => {
    setMaxTouchPoints(5);
    const { result } = renderHook(() => useIsTouchDevice());
    expect(result.current).toBe(true);
  });
});

describe('useDeviceInfo', () => {
  beforeEach(() => {
    setWindowSize(1024);
    setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)');
    setPlatform('MacIntel');
    setMaxTouchPoints(0);

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    if (originalInnerWidth) Object.defineProperty(window, 'innerWidth', originalInnerWidth);
    if (originalInnerHeight) Object.defineProperty(window, 'innerHeight', originalInnerHeight);
    if (originalUserAgent) Object.defineProperty(navigator, 'userAgent', originalUserAgent);
    if (originalPlatform) Object.defineProperty(navigator, 'platform', originalPlatform);
    if (originalMaxTouchPoints) Object.defineProperty(navigator, 'maxTouchPoints', originalMaxTouchPoints);
  });

  it('returns desktop info for wide viewport', () => {
    setWindowSize(1400, 900);
    const { result } = renderHook(() => useDeviceInfo());

    expect(result.current.isPhone).toBe(false);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isTabletOrLarger).toBe(true);
    expect(result.current.mobileColumns).toBe(6);
  });

  it('returns phone info for narrow viewport', () => {
    setWindowSize(375, 812);
    setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X)');

    // Need coarse pointer for mobile detection
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('coarse'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const { result } = renderHook(() => useDeviceInfo());

    expect(result.current.isPhone).toBe(true);
    expect(result.current.mobileColumns).toBe(2);
  });
});
