import type {
  Browser,
  DeviceType,
  InstallMethod,
  InstallMethodContext,
  InstallInstructionContext,
  Platform,
} from './types';

export const isDesktopPlatform = (platform: Platform): boolean =>
  platform === 'mac' || platform === 'windows' || platform === 'linux';

export const detectPlatform = (): Platform => {
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }

  const ua = navigator.userAgent || '';
  const navPlatform = navigator.platform || '';

  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (navPlatform === 'MacIntel' && navigator.maxTouchPoints > 1) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Mac/i.test(navPlatform) || /Macintosh/i.test(ua)) return 'mac';
  if (/Win/i.test(navPlatform) || /Windows/i.test(ua)) return 'windows';
  if (/Linux/i.test(navPlatform) || /Linux/i.test(ua)) return 'linux';

  return 'unknown';
};

export const detectBrowser = (): Browser => {
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }

  const ua = navigator.userAgent || '';

  if (/SamsungBrowser/i.test(ua)) return 'samsung';
  if (/Edg/i.test(ua)) return 'edge';
  if (/Chrome|CriOS/i.test(ua) && !/Edg/i.test(ua) && !/SamsungBrowser/i.test(ua)) return 'chrome';
  if (/Firefox|FxiOS/i.test(ua)) return 'firefox';
  if (/Safari/i.test(ua) && !/Chrome|CriOS/i.test(ua)) return 'safari';

  return 'unknown';
};

export const detectDeviceType = (platform: Platform): DeviceType => {
  if (typeof navigator === 'undefined') {
    return 'desktop';
  }

  const ua = navigator.userAgent || '';
  const navPlatform = navigator.platform || '';

  if (/iPad/i.test(ua)) return 'tablet';
  if (navPlatform === 'MacIntel' && navigator.maxTouchPoints > 1) return 'tablet';
  if (/Android/i.test(ua) && !/Mobile/i.test(ua)) return 'tablet';
  if (/iPhone|iPod/i.test(ua)) return 'phone';
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return 'phone';
  if (isDesktopPlatform(platform)) return 'desktop';

  return 'desktop';
};

export const detectSafariPwaSupport = (browser: Browser, platform: Platform): boolean => {
  if (typeof navigator === 'undefined' || browser !== 'safari' || platform !== 'mac') {
    return false;
  }

  const ua = navigator.userAgent || '';
  const versionMatch = ua.match(/Version\/(\d+)/);
  if (versionMatch) {
    const majorVersion = parseInt(versionMatch[1], 10);
    return majorVersion >= 17;
  }

  return true;
};

export const getInstallMethod = (context: InstallMethodContext): InstallMethod => {
  const {
    isStandalone,
    deferredPrompt,
    platform,
    browser,
    safariSupportsPWA,
    isDesktopChromium,
  } = context;

  if (isStandalone) return 'none';
  if (deferredPrompt) return 'prompt';
  if (platform === 'mac' && browser === 'safari' && safariSupportsPWA) return 'safari-dock';
  if (platform === 'ios' && browser === 'safari') return 'safari-home-screen';
  if (platform === 'ios' && browser === 'chrome') return 'safari-home-screen';
  if (platform === 'ios' && browser === 'edge') return 'safari-home-screen';

  if (browser === 'firefox' && isDesktopPlatform(platform)) {
    return 'none';
  }

  if (isDesktopChromium) {
    return 'none';
  }

  return 'none';
};

export const getInstallInstructions = (context: InstallInstructionContext): string[] => {
  const {
    installMethod,
    browser,
    deviceType,
    isWaitingForPrompt,
    isAppInstalled,
    promptTimedOut,
    isDesktopChromium,
    platform,
  } = context;

  if (isAppInstalled || (promptTimedOut && isDesktopChromium)) {
    if (deviceType === 'phone' || deviceType === 'tablet') {
      return ['Find Reigh on your home screen:'];
    }
    return ['Look for this in your address bar:'];
  }

  if (isWaitingForPrompt) {
    return ['Look for this in your address bar:'];
  }

  switch (installMethod) {
    case 'prompt':
      if (platform === 'android') {
        return ['Tap "Install" when the banner appears:'];
      }
      return ['Look for this in your address bar:'];
    case 'safari-dock':
      return ['In Safari, go to File > Add to Dock'];
    case 'safari-home-screen':
      if (deviceType === 'tablet') {
        if (browser === 'chrome') {
          return ['Tap Share icon at top-right, then "Add to Home Screen"'];
        }
        if (browser === 'edge') {
          return ['Tap menu, then Share, then "Add to Home Screen"'];
        }
        return ['Tap Share in the toolbar, then "Add to Home Screen"'];
      }

      if (browser === 'chrome') {
        return ['Tap Share icon at top-right, then "Add to Home Screen"'];
      }
      if (browser === 'edge') {
        return ['Tap menu at bottom, then Share, then "Add to Home Screen"'];
      }
      return ['Tap Share, then "Add to Home Screen"'];
    default:
      return [];
  }
};

export const getCtaText = (
  isStandalone: boolean,
  installMethod: InstallMethod,
  isWaitingForPrompt: boolean,
  isAppInstalled: boolean,
  promptTimedOut: boolean,
  isDesktopChromium: boolean,
  platform: Platform,
): string => {
  if (isStandalone) return 'Sign in with Discord';
  if (isAppInstalled || (promptTimedOut && isDesktopChromium)) return 'Open Reigh App';
  if (installMethod === 'none' && !isWaitingForPrompt) return 'Sign in with Discord';

  switch (platform) {
    case 'mac':
      return 'Install for Mac';
    case 'windows':
      return 'Install for Windows';
    case 'linux':
      return 'Install for Linux';
    case 'ios':
      return 'Add to Home Screen';
    case 'android':
      return 'Install App';
    default:
      return 'Install App';
  }
};

export const getCtaIcon = (
  isStandalone: boolean,
  installMethod: InstallMethod,
  isWaitingForPrompt: boolean,
  isAppInstalled: boolean,
  promptTimedOut: boolean,
  isDesktopChromium: boolean,
  platform: Platform,
): 'download' | 'plus' | 'discord' | 'external' => {
  if (isStandalone) return 'discord';
  if (isAppInstalled || (promptTimedOut && isDesktopChromium)) return 'external';
  if (installMethod === 'none' && !isWaitingForPrompt) return 'discord';
  if (platform === 'ios') return 'plus';
  return 'download';
};
