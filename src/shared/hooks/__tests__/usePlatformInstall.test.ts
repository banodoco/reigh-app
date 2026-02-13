import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/shared/lib/errorHandler', () => ({
  handleError: vi.fn(),
}));

import { usePlatformInstall } from '../usePlatformInstall';

const originalMatchMedia = window.matchMedia;
const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
const originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform');
const originalMaxTouchPoints = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');

function setUA(ua: string) {
  Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true, writable: true });
}

function setPlatform(p: string) {
  Object.defineProperty(navigator, 'platform', { value: p, configurable: true, writable: true });
}

function setMaxTouchPoints(n: number) {
  Object.defineProperty(navigator, 'maxTouchPoints', { value: n, configurable: true, writable: true });
}

describe('usePlatformInstall', () => {
  beforeEach(() => {
    vi.useFakeTimers();

    // Default: desktop Mac Chrome
    setPlatform('MacIntel');
    setMaxTouchPoints(0);
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    window.matchMedia = originalMatchMedia;
    if (originalUserAgent) Object.defineProperty(navigator, 'userAgent', originalUserAgent);
    if (originalPlatform) Object.defineProperty(navigator, 'platform', originalPlatform);
    if (originalMaxTouchPoints) Object.defineProperty(navigator, 'maxTouchPoints', originalMaxTouchPoints);
  });

  it('detects Mac platform', () => {
    setPlatform('MacIntel');
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0');

    const { result } = renderHook(() => usePlatformInstall());

    expect(result.current.platform).toBe('mac');
    expect(result.current.deviceType).toBe('desktop');
  });

  it('detects Windows platform', () => {
    setPlatform('Win32');
    setUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0');

    const { result } = renderHook(() => usePlatformInstall());

    expect(result.current.platform).toBe('windows');
  });

  it('detects iOS platform from UA', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

    const { result } = renderHook(() => usePlatformInstall());

    expect(result.current.platform).toBe('ios');
    expect(result.current.deviceType).toBe('phone');
  });

  it('detects iPadOS via MacIntel + touch', () => {
    setPlatform('MacIntel');
    setMaxTouchPoints(5);
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15');

    const { result } = renderHook(() => usePlatformInstall());

    expect(result.current.platform).toBe('ios');
    expect(result.current.deviceType).toBe('tablet');
  });

  it('detects Android platform', () => {
    setPlatform('Linux armv8l');
    setUA('Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36');

    const { result } = renderHook(() => usePlatformInstall());

    expect(result.current.platform).toBe('android');
  });

  it('detects Chrome browser', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const { result } = renderHook(() => usePlatformInstall());

    expect(result.current.browser).toBe('chrome');
  });

  it('detects Safari browser', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15');

    const { result } = renderHook(() => usePlatformInstall());

    expect(result.current.browser).toBe('safari');
  });

  it('detects Edge browser', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0');

    const { result } = renderHook(() => usePlatformInstall());

    expect(result.current.browser).toBe('edge');
  });

  it('detects Firefox browser', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0');

    const { result } = renderHook(() => usePlatformInstall());

    expect(result.current.browser).toBe('firefox');
  });

  it('returns isStandalone=false when not in PWA mode', () => {
    const { result } = renderHook(() => usePlatformInstall());
    expect(result.current.isStandalone).toBe(false);
  });

  it('returns canInstall=false initially (no beforeinstallprompt)', () => {
    const { result } = renderHook(() => usePlatformInstall());
    expect(result.current.canInstall).toBe(false);
  });

  it('sets canInstall=true on beforeinstallprompt event', () => {
    const { result } = renderHook(() => usePlatformInstall());

    act(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(event, {
        prompt: vi.fn(),
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(event);
    });

    expect(result.current.canInstall).toBe(true);
    expect(result.current.installMethod).toBe('prompt');
  });

  it('sets isAppInstalled on appinstalled event', () => {
    const { result } = renderHook(() => usePlatformInstall());

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(result.current.isAppInstalled).toBe(true);
  });

  it('returns safari-dock install method for Safari on Mac', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15');

    const { result } = renderHook(() => usePlatformInstall());

    // Wait for prompt timeout
    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(result.current.installMethod).toBe('safari-dock');
    expect(result.current.showInstallCTA).toBe(true);
  });

  it('returns safari-home-screen for Safari on iOS', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

    const { result } = renderHook(() => usePlatformInstall());

    // Wait for prompt timeout
    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(result.current.installMethod).toBe('safari-home-screen');
  });

  it('shows "Install for Mac" CTA on Mac Chrome', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    const { result } = renderHook(() => usePlatformInstall());

    act(() => {
      const event = new Event('beforeinstallprompt', { cancelable: true });
      Object.assign(event, {
        prompt: vi.fn(),
        userChoice: Promise.resolve({ outcome: 'accepted' }),
      });
      window.dispatchEvent(event);
    });

    expect(result.current.ctaText).toBe('Install for Mac');
    expect(result.current.ctaIcon).toBe('download');
  });

  it('shows "Add to Home Screen" CTA on iOS', () => {
    setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');

    const { result } = renderHook(() => usePlatformInstall());

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(result.current.ctaText).toBe('Add to Home Screen');
    expect(result.current.ctaIcon).toBe('plus');
  });

  it('shows "Sign in with Discord" when no install method is available', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:120.0) Gecko/20100101 Firefox/120.0');

    const { result } = renderHook(() => usePlatformInstall());

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(result.current.ctaText).toBe('Sign in with Discord');
    expect(result.current.ctaIcon).toBe('discord');
    expect(result.current.showInstallCTA).toBe(false);
  });

  it('triggerInstall returns false for non-prompt methods', async () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15');

    const { result } = renderHook(() => usePlatformInstall());

    const success = await result.current.triggerInstall();
    expect(success).toBe(false);
  });

  it('shows waiting state for Chrome desktop before prompt fires', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

    const { result } = renderHook(() => usePlatformInstall());

    // Before timeout, should be waiting for prompt
    expect(result.current.isWaitingForPrompt).toBe(true);
  });

  it('shows "Open Reigh App" when prompt timed out on Chrome desktop', () => {
    setUA('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36');

    const { result } = renderHook(() => usePlatformInstall());

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(result.current.isAppInstalled).toBe(true);
    expect(result.current.ctaText).toBe('Open Reigh App');
    expect(result.current.ctaIcon).toBe('external');
  });
});
