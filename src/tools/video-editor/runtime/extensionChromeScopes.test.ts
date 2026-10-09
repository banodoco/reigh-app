import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineExtension } from '@reigh/editor-sdk';
import { CONTEXT_DISPOSE_SYMBOL } from '@/sdk/context';
import { createExtensionContext } from './extensionContextFactory';

const extension = defineExtension({ manifest: { id: 'example.scoped-chrome', version: '1.0.0', label: 'Scoped chrome' } });
const context = (root: () => HTMLElement | null) => createExtensionContext(
  extension, undefined, undefined, undefined, undefined, undefined, undefined,
  undefined, undefined, undefined, undefined, undefined, root,
);
const dispose = (ctx: ReturnType<typeof context>) => {
  (ctx as unknown as Record<symbol, () => void>)[CONTEXT_DISPOSE_SYMBOL]();
};
afterEach(() => { document.body.replaceChildren(); vi.restoreAllMocks(); });

describe('assembly-scoped chrome', () => {
  it('focuses and announces only inside its full/dialog root, including a late-mounted root', () => {
    const roots = [document.createElement('section'), document.createElement('section')];
    const buttons = roots.map((root) => {
      const button = document.createElement('button'); button.className = 'shared-target';
      root.append(button); document.body.append(root); return button;
    });
    let dialogRoot: HTMLElement | null = null;
    const full = context(() => roots[0]);
    const dialog = context(() => dialogRoot);
    dialog.chrome.focus('.shared-target');
    expect(dialog.services.diagnostics.diagnostics.at(-1)?.code).toBe('chrome/focus-no-shell');
    dialogRoot = roots[1];
    dialog.chrome.focus('.shared-target');
    expect(document.activeElement).toBe(buttons[1]);
    full.chrome.focus('.shared-target');
    expect(document.activeElement).toBe(buttons[0]);
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => { frames.push(fn); return frames.length; });
    full.chrome.announce('Full'); dialog.chrome.announce('Dialog', 'assertive');
    frames.forEach((fn) => fn(0));
    expect(roots[0].querySelector('[data-video-editor-aria-live]')?.textContent).toBe('Full');
    expect(roots[1].querySelector('[data-video-editor-aria-live]')?.textContent).toBe('Dialog');
    dispose(dialog);
    expect(roots[1].querySelector('[data-video-editor-aria-live]')).toBeNull();
    expect(roots[0].querySelector('[data-video-editor-aria-live]')?.textContent).toBe('Full');
    dispose(full);
  });

  it('cancels pending announcements and chrome subscriptions on terminal disposal', () => {
    const root = document.createElement('section'); document.body.append(root);
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => { frames.push(fn); return frames.length; });
    const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const ctx = context(() => root);
    const progress = vi.fn(); ctx.chrome.subscribe('progress', progress);
    ctx.chrome.announce('Stale');
    const node = root.querySelector('[data-video-editor-aria-live]');
    dispose(ctx);
    frames.forEach((fn) => fn(0)); ctx.chrome.progress(50);
    expect(cancel).toHaveBeenCalledWith(1);
    expect(node?.textContent).toBe('');
    expect(root.querySelector('[data-video-editor-aria-live]')).toBeNull();
    expect(progress).not.toHaveBeenCalled();
  });
});
