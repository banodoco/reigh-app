import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetInstallPromptSignalsForTests,
  runInstallPrompt,
  useInstallPromptSignals,
  useStandaloneStatus,
} from './signals';

const originalMatchMedia = window.matchMedia;
const originalStandalone = Object.getOwnPropertyDescriptor(navigator, 'standalone');
const originalGetInstalledRelatedApps = Object.getOwnPropertyDescriptor(navigator, 'getInstalledRelatedApps');

describe('platform install signals', () => {
  let standaloneMatches = false;
  let fullscreenMatches = false;
  let standaloneListeners: Set<(event: Event) => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    __resetInstallPromptSignalsForTests();
    standaloneMatches = false;
    fullscreenMatches = false;
    standaloneListeners = new Set();

    Object.defineProperty(navigator, 'standalone', {
      value: false,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'getInstalledRelatedApps', {
      value: undefined,
      configurable: true,
      writable: true,
    });

    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === '(display-mode: standalone)' ? standaloneMatches : fullscreenMatches,
      media: query,
      addEventListener: (_event: string, callback: (event: Event) => void) => {
        if (query === '(display-mode: standalone)') {
          standaloneListeners.add(callback);
        }
      },
      removeEventListener: (_event: string, callback: (event: Event) => void) => {
        if (query === '(display-mode: standalone)') {
          standaloneListeners.delete(callback);
        }
      },
      addListener: (callback: (event: Event) => void) => {
        if (query === '(display-mode: standalone)') {
          standaloneListeners.add(callback);
        }
      },
      removeListener: (callback: (event: Event) => void) => {
        if (query === '(display-mode: standalone)') {
          standaloneListeners.delete(callback);
        }
      },
      dispatchEvent: vi.fn(),
    }));
  });

  afterEach(() => {
    __resetInstallPromptSignalsForTests();
    vi.useRealTimers();
    window.matchMedia = originalMatchMedia;
    if (originalStandalone) {
      Object.defineProperty(navigator, 'standalone', originalStandalone);
    }
    if (originalGetInstalledRelatedApps) {
      Object.defineProperty(navigator, 'getInstalledRelatedApps', originalGetInstalledRelatedApps);
    }
  });

  it('tracks standalone status and reacts to media query updates', () => {
    const { result } = renderHook(() => useStandaloneStatus());

    expect(result.current).toBe(false);

    standaloneMatches = true;
    act(() => {
      standaloneListeners.forEach((listener) => listener(new Event('change')));
    });

    expect(result.current).toBe(true);
  });

  it('stores deferred prompt and marks app installed on window events', () => {
    const { result } = renderHook(() => useInstallPromptSignals());

    const promptEvent = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
    };
    promptEvent.prompt = vi.fn().mockResolvedValue(undefined);
    promptEvent.userChoice = Promise.resolve({ outcome: 'accepted' });

    act(() => {
      window.dispatchEvent(promptEvent);
    });

    expect(result.current.deferredPrompt).toBe(promptEvent);
    expect(result.current.promptTimedOut).toBe(false);

    act(() => {
      window.dispatchEvent(new Event('appinstalled'));
    });

    expect(result.current.deferredPrompt).toBeNull();
    expect(result.current.isAppInstalled).toBe(true);
  });

  it('marks timeout and probes related apps when prompt does not arrive', async () => {
    const getInstalledRelatedApps = vi.fn().mockResolvedValue([{ platform: 'webapp' }]);
    Object.defineProperty(navigator, 'getInstalledRelatedApps', {
      value: getInstalledRelatedApps,
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useInstallPromptSignals());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.promptTimedOut).toBe(true);
    expect(result.current.isAppInstalled).toBe(true);
    expect(getInstalledRelatedApps).toHaveBeenCalledTimes(1);
  });

  it('keeps capture document-lifetime, single-flights by event identity, and ignores replacement results', async () => {
    let resolveChoiceA!: (choice: { outcome: 'accepted' | 'dismissed' }) => void;
    const choiceA = new Promise<{ outcome: 'accepted' | 'dismissed' }>((resolve) => { resolveChoiceA = resolve; });
    const promptA = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: choiceA,
    });
    const promptB = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: vi.fn().mockResolvedValue(undefined),
      userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
    });

    const first = renderHook(() => useInstallPromptSignals());
    act(() => window.dispatchEvent(promptA));
    first.unmount();

    const second = renderHook(() => useInstallPromptSignals());
    expect(second.result.current.deferredPrompt).toBe(promptA);
    const firstFlight = runInstallPrompt(promptA);
    expect(runInstallPrompt(promptA)).toBe(firstFlight);
    expect(promptA.prompt).toHaveBeenCalledTimes(1);

    act(() => window.dispatchEvent(promptB));
    resolveChoiceA({ outcome: 'accepted' });
    await act(async () => { await firstFlight; });

    expect(second.result.current.deferredPrompt).toBe(promptB);
    expect(second.result.current.consumeDeferredPrompt(promptA)).toBe(false);
    expect(second.result.current.consumeDeferredPrompt(promptB)).toBe(true);
  });
});
