// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import {
  __resetInstallPromptSignalsForTests,
  useInstallPromptSignals,
} from '@/shared/hooks/platformInstall/signals';
import { PublicAstridInstallDialog } from './PublicAstridInstallDialog';

const originalUserAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
const originalPlatform = Object.getOwnPropertyDescriptor(navigator, 'platform');
const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
const originalShare = Object.getOwnPropertyDescriptor(navigator, 'share');

function setNavigator(userAgent: string, platform: string) {
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

function promptEvent(userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>) {
  return Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
    prompt: vi.fn().mockResolvedValue(undefined),
    userChoice,
  });
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open install</button>
      <PublicAstridInstallDialog open={open} onClose={() => setOpen(false)} />
    </>
  );
}

describe('PublicAstridInstallDialog', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetInstallPromptSignalsForTests();
    setNavigator(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'MacIntel',
    );
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) }, configurable: true,
    });
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    window.matchMedia = vi.fn().mockImplementation((media: string) => ({
      media,
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) { this.open = true; }),
    });
    Object.defineProperty(HTMLDialogElement.prototype, 'close', {
      configurable: true,
      value: vi.fn(function (this: HTMLDialogElement) { this.open = false; }),
    });
  });

  afterEach(() => {
    cleanup();
    __resetInstallPromptSignalsForTests();
    vi.restoreAllMocks();
    if (originalUserAgent) Object.defineProperty(navigator, 'userAgent', originalUserAgent);
    if (originalPlatform) Object.defineProperty(navigator, 'platform', originalPlatform);
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else delete (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
    if (originalShare) Object.defineProperty(navigator, 'share', originalShare);
    else delete (navigator as Navigator & { share?: Navigator['share'] }).share;
    vi.useRealTimers();
  });

  it('returns focus to the Home CTA and closes safely', () => {
    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open install' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.querySelector('dialog')).not.toHaveAttribute('open');
    expect(trigger).toHaveFocus();
  });

  it.each([
    ['chromium', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36', 'MacIntel', 'Astrid installs straight from your browser'],
    ['safari', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15', 'MacIntel', 'Astrid installs straight from Safari'],
    ['mobile', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1', 'iPhone', 'Astrid is made for a computer for now'],
  ] as const)('renders the %s install variant', (scenario, userAgent, platform, copy) => {
    setNavigator(userAgent, platform);
    render(<Harness />);
    screen.getByRole('button', { name: 'Open install' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Open install' }));
    expect(screen.getByRole('dialog')).toHaveAttribute('data-scenario', scenario);
    expect(screen.getByText(new RegExp(copy))).toBeInTheDocument();
  });

  it('renders the installed variant without an install prompt action', () => {
    act(() => window.dispatchEvent(new Event('appinstalled')));
    render(<Harness />);
    screen.getByRole('button', { name: 'Open install' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Open install' }));
    expect(screen.getByRole('heading', { name: 'Astrid is installed' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Install now' })).not.toBeInTheDocument();
  });

  it('does not consume a prompt whose result arrives after modal departure', async () => {
    const choice = deferred<{ outcome: 'accepted' | 'dismissed' }>();
    const event = promptEvent(choice.promise);
    act(() => window.dispatchEvent(event));
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open install' }));
    fireEvent.click(screen.getByRole('button', { name: 'Install now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    choice.resolve({ outcome: 'accepted' });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const observer = render(<PromptObserver />);
    expect(observer.container).toHaveTextContent('present');
  });

  it('ignores a late clipboard result after mobile modal close and bounds feedback', async () => {
    setNavigator(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      'iPhone',
    );
    const write = deferred<void>();
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(() => write.promise) }, configurable: true });
    render(<Harness />);
    screen.getByRole('button', { name: 'Open install' }).focus();
    fireEvent.click(screen.getByRole('button', { name: 'Open install' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send the link to your computer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    write.resolve();
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText('Link copied')).not.toBeInTheDocument();
    await act(async () => { await vi.advanceTimersByTimeAsync(2_000); });
    expect(screen.getByRole('button', { name: 'Open install' })).toHaveFocus();
  });

  it('does not apply a late share result after close', async () => {
    setNavigator(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      'iPhone',
    );
    const sharing = deferred<void>();
    const share = vi.fn(() => sharing.promise);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open install' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send the link to your computer' }));
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    sharing.resolve();
    await act(async () => { await Promise.resolve(); });
    expect(share).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Link copied')).not.toBeInTheDocument();
  });
});

function PromptObserver() {
  const { deferredPrompt } = useInstallPromptSignals();
  return <span>{deferredPrompt ? 'present' : 'consumed'}</span>;
}
