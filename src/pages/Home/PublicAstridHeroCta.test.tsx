// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetInstallPromptSignalsForTests } from '@/shared/hooks/platformInstall/signals';
import { PublicAstridHeroCta } from './PublicAstridHeroCta';

const originalClipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard');

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

describe('PublicAstridHeroCta feedback ownership', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetInstallPromptSignalsForTests();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn() }, configurable: true,
    });
    window.matchMedia = vi.fn().mockImplementation((media: string) => ({
      media,
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }));
  });

  afterEach(() => {
    cleanup();
    __resetInstallPromptSignalsForTests();
    if (originalClipboard) Object.defineProperty(navigator, 'clipboard', originalClipboard);
    else delete (navigator as Navigator & { clipboard?: Clipboard }).clipboard;
    vi.useRealTimers();
  });

  it('only applies the latest concurrent copy result and bounds its feedback timer', async () => {
    const first = deferred<void>();
    const second = deferred<void>();
    const writeText = vi.fn()
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const view = render(<PublicAstridHeroCta audience="agent" active />);
    const command = view.container.querySelector('.astrid-install-command')!;

    fireEvent.click(command);
    fireEvent.click(command);
    first.resolve();
    await act(async () => { await Promise.resolve(); });
    expect(view.container.querySelector('[role="status"]')).toHaveTextContent('');
    second.resolve();
    await act(async () => { await Promise.resolve(); });
    expect(view.container.querySelector('[role="status"]')).toHaveTextContent('Copied');
    await act(async () => { await vi.advanceTimersByTimeAsync(1_800); });
    expect(view.container.querySelector('[role="status"]')).toHaveTextContent('');
  });

  it('ignores a clipboard result after the Hero leaves Home', async () => {
    const write = deferred<void>();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn(() => write.promise) }, configurable: true,
    });
    const view = render(<PublicAstridHeroCta audience="agent" active />);
    const command = view.container.querySelector('.astrid-install-command')!;
    fireEvent.click(command);
    view.rerender(<PublicAstridHeroCta audience="agent" active={false} />);
    write.resolve();
    await act(async () => { await Promise.resolve(); });
    expect(view.container.querySelector('[role="status"]')).toHaveTextContent('');
  });
});
