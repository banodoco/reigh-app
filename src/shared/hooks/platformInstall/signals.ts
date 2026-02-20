import { useEffect, useState } from 'react';
import type {
  BeforeInstallPromptEvent,
  InstallPromptSignals,
  NavigatorWithExtensions,
} from './types';

const checkIsStandalone = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
    const displayModeFullscreen = window.matchMedia('(display-mode: fullscreen)').matches;
    const iosStandalone = (navigator as NavigatorWithExtensions).standalone === true;
    return displayModeStandalone || displayModeFullscreen || iosStandalone;
  } catch {
    return false;
  }
};

export function useStandaloneStatus(): boolean {
  const [isStandalone, setIsStandalone] = useState(checkIsStandalone);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const mq = window.matchMedia('(display-mode: standalone)');
    const handler = () => setIsStandalone(checkIsStandalone());

    try {
      mq.addEventListener('change', handler);
    } catch {
      mq.addListener(handler);
    }

    return () => {
      try {
        mq.removeEventListener('change', handler);
      } catch {
        mq.removeListener(handler);
      }
    };
  }, []);

  return isStandalone;
}

export function useInstallPromptSignals(): InstallPromptSignals {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [promptTimedOut, setPromptTimedOut] = useState(false);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [promptConsumed, setPromptConsumed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | null = setTimeout(() => {
      setPromptTimedOut(true);
      const nav = navigator as NavigatorWithExtensions;
      if (nav.getInstalledRelatedApps) {
        nav.getInstalledRelatedApps()
          .then((apps) => {
            if (apps && apps.length > 0) {
              setIsAppInstalled(true);
            }
          })
          .catch(() => {
            // Non-fatal capability probe.
          });
      }
    }, 3000);

    const clearTimeoutIfNeeded = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      clearTimeoutIfNeeded();
      setPromptTimedOut(false);
      setPromptConsumed(false);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsAppInstalled(true);
      clearTimeoutIfNeeded();
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      clearTimeoutIfNeeded();
    };
  }, []);

  return {
    deferredPrompt,
    promptTimedOut,
    isAppInstalled,
    promptConsumed,
    setDeferredPrompt,
    setPromptConsumed,
  };
}
