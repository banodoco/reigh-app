import { useEffect, useState, useSyncExternalStore } from 'react';
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

interface InstallSignalSnapshot {
  deferredPrompt: BeforeInstallPromptEvent | null;
  promptTimedOut: boolean;
  isAppInstalled: boolean;
  promptConsumed: boolean;
}

const EMPTY_SNAPSHOT: InstallSignalSnapshot = {
  deferredPrompt: null,
  promptTimedOut: false,
  isAppInstalled: false,
  promptConsumed: false,
};

let snapshot = EMPTY_SNAPSHOT;
let observedWindow: Window | null = null;
let promptTimeoutId: ReturnType<typeof setTimeout> | null = null;
let promptEpoch = 0;
const subscribers = new Set<() => void>();
const promptFlights = new WeakMap<BeforeInstallPromptEvent, Promise<{ outcome: 'accepted' | 'dismissed' }>>();

function publish(next: Partial<InstallSignalSnapshot>) {
  const nextSnapshot = { ...snapshot, ...next };
  if (
    nextSnapshot.deferredPrompt === snapshot.deferredPrompt
    && nextSnapshot.promptTimedOut === snapshot.promptTimedOut
    && nextSnapshot.isAppInstalled === snapshot.isAppInstalled
    && nextSnapshot.promptConsumed === snapshot.promptConsumed
  ) return;
  snapshot = nextSnapshot;
  subscribers.forEach((subscriber) => subscriber());
}

function clearPromptTimeout() {
  if (promptTimeoutId !== null) {
    clearTimeout(promptTimeoutId);
    promptTimeoutId = null;
  }
}

function handleBeforeInstallPrompt(event: Event) {
  const prompt = event as BeforeInstallPromptEvent;
  event.preventDefault();
  if (snapshot.deferredPrompt === prompt) return;
  promptEpoch += 1;
  clearPromptTimeout();
  publish({ deferredPrompt: prompt, promptTimedOut: false, promptConsumed: false });
}

function handleAppInstalled() {
  promptEpoch += 1;
  clearPromptTimeout();
  publish({ deferredPrompt: null, isAppInstalled: true, promptConsumed: true });
}

function ensureInstallListeners() {
  if (typeof window === 'undefined' || observedWindow === window) return;
  observedWindow = window;
  window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
  window.addEventListener('appinstalled', handleAppInstalled);
}

function startPromptTimeout() {
  ensureInstallListeners();
  if (promptTimeoutId !== null || snapshot.deferredPrompt || snapshot.promptTimedOut || snapshot.isAppInstalled) return;

  const timeoutEpoch = promptEpoch;
  promptTimeoutId = setTimeout(() => {
    promptTimeoutId = null;
    if (timeoutEpoch !== promptEpoch || snapshot.deferredPrompt || snapshot.isAppInstalled) return;
    publish({ promptTimedOut: true });
    const nav = navigator as NavigatorWithExtensions;
    if (!nav.getInstalledRelatedApps) return;
    nav.getInstalledRelatedApps()
      .then((apps) => {
        if (timeoutEpoch !== promptEpoch || snapshot.deferredPrompt) return;
        if (apps && apps.length > 0) publish({ isAppInstalled: true });
      })
      .catch(() => {
        // Non-fatal capability probe.
      });
  }, 3000);
}

const subscribe = (subscriber: () => void) => {
  ensureInstallListeners();
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
};

const getSnapshot = () => snapshot;

export function runInstallPrompt(event: BeforeInstallPromptEvent): Promise<{ outcome: 'accepted' | 'dismissed' }> {
  const existing = promptFlights.get(event);
  if (existing) return existing;

  let flight: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  try {
    // Keep prompt() in the caller's event turn. Deferring this call would lose the browser's user gesture.
    const promptResult = event.prompt();
    flight = Promise.resolve(promptResult).then(() => event.userChoice);
  } catch (error) {
    flight = Promise.reject(error);
  }
  promptFlights.set(event, flight);
  return flight;
}

function setDeferredPrompt(value: BeforeInstallPromptEvent | null) {
  if (value === null) {
    if (snapshot.deferredPrompt !== null) promptEpoch += 1;
    publish({ deferredPrompt: null });
    return;
  }
  if (snapshot.deferredPrompt === value) return;
  promptEpoch += 1;
  clearPromptTimeout();
  publish({ deferredPrompt: value, promptTimedOut: false, promptConsumed: false });
}

function setPromptConsumed(value: boolean) {
  publish({ promptConsumed: value });
}

function consumeDeferredPrompt(event: BeforeInstallPromptEvent): boolean {
  if (snapshot.deferredPrompt !== event) return false;
  promptEpoch += 1;
  publish({ deferredPrompt: null, promptConsumed: true });
  return true;
}

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
  ensureInstallListeners();
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    startPromptTimeout();
  }, []);

  return {
    deferredPrompt: current.deferredPrompt,
    promptTimedOut: current.promptTimedOut,
    isAppInstalled: current.isAppInstalled,
    promptConsumed: current.promptConsumed,
    setDeferredPrompt,
    setPromptConsumed,
    consumeDeferredPrompt,
  };
}

/** Test-only reset for the document-lifetime store. Production code never resets capability state. */
export function __resetInstallPromptSignalsForTests() {
  clearPromptTimeout();
  promptEpoch += 1;
  snapshot = EMPTY_SNAPSHOT;
  subscribers.forEach((subscriber) => subscriber());
}
