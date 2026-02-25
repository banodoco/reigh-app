import { useMemo, useCallback } from 'react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  detectPlatform,
  detectBrowser,
  detectDeviceType,
  detectSafariPwaSupport,
  getInstallMethod,
  getInstallInstructions,
  getCtaText,
  getCtaIcon,
  isDesktopPlatform,
} from './platformInstall/platformDetection';
import {
  useStandaloneStatus,
  useInstallPromptSignals,
} from './platformInstall/signals';
import type {
  Browser,
  DeviceType,
  InstallMethod,
  Platform,
  PlatformInstallState,
} from './platformInstall/types';

export type {
  Browser,
  DeviceType,
  InstallMethod,
  Platform,
} from './platformInstall/types';

/**
 * Detects platform, browser, and PWA installation capabilities.
 * Provides contextual CTA text and install methods.
 */
export function usePlatformInstall(): PlatformInstallState {
  const platform = useMemo<Platform>(() => detectPlatform(), []);
  const browser = useMemo<Browser>(() => detectBrowser(), []);
  const deviceType = useMemo<DeviceType>(() => detectDeviceType(platform), [platform]);
  const safariSupportsPWA = useMemo<boolean>(() => detectSafariPwaSupport(browser, platform), [browser, platform]);

  const isStandalone = useStandaloneStatus();
  const {
    deferredPrompt,
    promptTimedOut,
    isAppInstalled,
    promptConsumed,
    setDeferredPrompt,
    setPromptConsumed,
  } = useInstallPromptSignals();

  const isDesktopChromium = useMemo<boolean>(
    () => (browser === 'chrome' || browser === 'edge') && isDesktopPlatform(platform),
    [browser, platform],
  );

  const isWaitingForPrompt = useMemo<boolean>(() => {
    if (isStandalone || deferredPrompt || promptTimedOut || isAppInstalled || promptConsumed) {
      return false;
    }
    return isDesktopChromium;
  }, [isStandalone, deferredPrompt, promptTimedOut, isAppInstalled, promptConsumed, isDesktopChromium]);

  const installMethod = useMemo<InstallMethod>(
    () =>
      getInstallMethod({
        isStandalone,
        deferredPrompt,
        platform,
        browser,
        safariSupportsPWA,
        isDesktopChromium,
      }),
    [isStandalone, deferredPrompt, platform, browser, safariSupportsPWA, isDesktopChromium],
  );

  const effectivelyInstalled = isAppInstalled || (promptTimedOut && isDesktopChromium);

  const installInstructions = useMemo<string[]>(
    () =>
      getInstallInstructions({
        installMethod,
        browser,
        platform,
        deviceType,
        isWaitingForPrompt,
        isAppInstalled,
        promptTimedOut,
        isDesktopChromium,
      }),
    [
      installMethod,
      browser,
      platform,
      deviceType,
      isWaitingForPrompt,
      isAppInstalled,
      promptTimedOut,
      isDesktopChromium,
    ],
  );

  const ctaContext = useMemo(
    () => ({ isStandalone, installMethod, isWaitingForPrompt, isAppInstalled, promptTimedOut, isDesktopChromium, platform }),
    [isStandalone, installMethod, isWaitingForPrompt, isAppInstalled, promptTimedOut, isDesktopChromium, platform],
  );

  const ctaText = useMemo<string>(() => getCtaText(ctaContext), [ctaContext]);

  const ctaIcon = useMemo<'download' | 'plus' | 'discord' | 'external'>(
    () => getCtaIcon(ctaContext), [ctaContext],
  );

  const showInstallCTA = useMemo<boolean>(() => {
    if (isStandalone) {
      return false;
    }
    return installMethod !== 'none' || isWaitingForPrompt || effectivelyInstalled;
  }, [isStandalone, installMethod, isWaitingForPrompt, effectivelyInstalled]);

  const triggerInstall = useCallback(async (): Promise<boolean> => {
    if (installMethod !== 'prompt' || !deferredPrompt) {
      return false;
    }

    try {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      setPromptConsumed(true);
      return outcome === 'accepted';
    } catch (error) {
      normalizeAndPresentError(error, { context: 'usePlatformInstall', showToast: false });
      setPromptConsumed(true);
      return false;
    }
  }, [installMethod, deferredPrompt, setDeferredPrompt, setPromptConsumed]);

  return {
    platform,
    browser,
    deviceType,
    isStandalone,
    canInstall: !!deferredPrompt,
    isWaitingForPrompt,
    isAppInstalled: effectivelyInstalled,
    installMethod,
    ctaText,
    ctaIcon,
    showInstallCTA,
    installInstructions,
    triggerInstall,
  };
}
