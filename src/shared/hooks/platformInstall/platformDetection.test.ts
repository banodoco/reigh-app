import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectBrowser,
  detectDeviceType,
  detectPlatform,
  detectSafariPwaSupport,
  getCtaIcon,
  getCtaText,
  getInstallInstructions,
  getInstallMethod,
  isDesktopPlatform,
} from './platformDetection';

const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
const originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform');
const originalMaxTouchPoints = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');

function setNavigator({
  userAgent,
  platform,
  maxTouchPoints = 0,
}: {
  userAgent: string;
  platform: string;
  maxTouchPoints?: number;
}) {
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true, writable: true });
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true, writable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', { value: maxTouchPoints, configurable: true, writable: true });
}

describe('platformDetection', () => {
  beforeEach(() => {
    setNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      platform: 'MacIntel',
      maxTouchPoints: 0,
    });
  });

  afterEach(() => {
    if (originalUserAgent) Object.defineProperty(navigator, 'userAgent', originalUserAgent);
    if (originalPlatform) Object.defineProperty(navigator, 'platform', originalPlatform);
    if (originalMaxTouchPoints) Object.defineProperty(navigator, 'maxTouchPoints', originalMaxTouchPoints);
  });

  it('detects desktop platforms and iPadOS touch override', () => {
    expect(detectPlatform()).toBe('mac');
    expect(isDesktopPlatform('mac')).toBe(true);

    setNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15',
      platform: 'MacIntel',
      maxTouchPoints: 5,
    });
    expect(detectPlatform()).toBe('ios');
    expect(isDesktopPlatform('ios')).toBe(false);
  });

  it('detects browser families with expected precedence', () => {
    setNavigator({
      userAgent: 'Mozilla/5.0 (...) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
      platform: 'Win32',
    });
    expect(detectBrowser()).toBe('edge');

    setNavigator({
      userAgent: 'Mozilla/5.0 (...) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      platform: 'MacIntel',
    });
    expect(detectBrowser()).toBe('chrome');

    setNavigator({
      userAgent: 'Mozilla/5.0 (...) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15',
      platform: 'MacIntel',
    });
    expect(detectBrowser()).toBe('safari');
  });

  it('detects device type for phone/tablet/desktop', () => {
    setNavigator({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
      platform: 'Linux armv8l',
    });
    expect(detectDeviceType('android')).toBe('phone');

    setNavigator({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Tablet) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      platform: 'Linux armv8l',
    });
    expect(detectDeviceType('android')).toBe('tablet');

    setNavigator({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      platform: 'MacIntel',
    });
    expect(detectDeviceType('mac')).toBe('desktop');
  });

  it('detects Safari PWA support from major version', () => {
    setNavigator({
      userAgent: 'Mozilla/5.0 (...) Version/17.0 Safari/605.1.15',
      platform: 'MacIntel',
    });
    expect(detectSafariPwaSupport('safari', 'mac')).toBe(true);

    setNavigator({
      userAgent: 'Mozilla/5.0 (...) Safari/605.1.15',
      platform: 'MacIntel',
    });
    expect(detectSafariPwaSupport('safari', 'mac')).toBe(false);
  });

  it('chooses install method and instructions for key flows', () => {
    expect(getInstallMethod({
      isStandalone: false,
      deferredPrompt: {} as Event,
      platform: 'windows',
      browser: 'chrome',
      safariSupportsPWA: false,
      isDesktopChromium: true,
    })).toBe('prompt');

    expect(getInstallMethod({
      isStandalone: false,
      deferredPrompt: null,
      platform: 'ios',
      browser: 'edge',
      safariSupportsPWA: false,
      isDesktopChromium: false,
    })).toBe('safari-home-screen');

    expect(getInstallInstructions({
      installMethod: 'prompt',
      browser: 'chrome',
      platform: 'mac',
      deviceType: 'desktop',
      isWaitingForPrompt: true,
      isAppInstalled: false,
      promptTimedOut: false,
      isDesktopChromium: true,
    })).toEqual(['Look for this in your address bar:']);
  });

  it('chooses CTA text and icons for app-open and install states', () => {
    expect(getCtaText({
      isStandalone: false,
      installMethod: 'prompt',
      isWaitingForPrompt: false,
      isAppInstalled: true,
      promptTimedOut: false,
      isDesktopChromium: true,
      platform: 'windows',
    })).toBe('Open Reigh App');

    expect(getCtaText({
      isStandalone: false,
      installMethod: 'prompt',
      isWaitingForPrompt: false,
      isAppInstalled: false,
      promptTimedOut: false,
      isDesktopChromium: false,
      platform: 'ios',
    })).toBe('Add to Home Screen');

    expect(getCtaIcon({
      isStandalone: false,
      installMethod: 'none',
      isWaitingForPrompt: false,
      isAppInstalled: false,
      promptTimedOut: false,
      isDesktopChromium: false,
      platform: 'mac',
    })).toBe('discord');
  });
});
