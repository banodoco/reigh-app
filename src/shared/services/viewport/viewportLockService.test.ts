import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ViewportLockService, createViewportLockService } from './viewportLockService';

describe('ViewportLockService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.documentElement.classList.remove('lightbox-open');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('locks viewport and restores state on cleanup', () => {
    Object.defineProperty(window, 'scrollY', {
      value: 240,
      writable: true,
      configurable: true,
    });
    window.scrollTo = vi.fn();
    window.scrollBy = vi.fn();
    Object.defineProperty(window, 'visualViewport', {
      value: { offsetTop: 12 },
      configurable: true,
    });

    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const blurSpy = vi.spyOn(input, 'blur');

    const service = new ViewportLockService();
    const unlock = service.lockLightboxViewport();

    expect(document.documentElement.classList.contains('lightbox-open')).toBe(true);

    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    vi.advanceTimersByTime(100);
    expect(window.scrollBy).toHaveBeenCalledWith(0, -1);
    expect(window.scrollBy).toHaveBeenCalledWith(0, 1);

    unlock();

    expect(blurSpy).toHaveBeenCalled();
    expect(document.documentElement.classList.contains('lightbox-open')).toBe(false);
    expect(window.scrollTo).toHaveBeenCalledWith(0, 240);
  });

  it('factory returns a service instance', () => {
    expect(createViewportLockService()).toBeInstanceOf(ViewportLockService);
  });
});
