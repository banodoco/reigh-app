import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLightboxOpen } from '../useLightboxOpen';

describe('useLightboxOpen', () => {
  afterEach(() => {
    document.documentElement.classList.remove('lightbox-open');
  });

  it('returns false when lightbox-open class is absent', () => {
    document.documentElement.classList.remove('lightbox-open');
    const { result } = renderHook(() => useLightboxOpen());
    expect(result.current).toBe(false);
  });

  it('returns true when lightbox-open class is present on init', () => {
    document.documentElement.classList.add('lightbox-open');
    const { result } = renderHook(() => useLightboxOpen());
    expect(result.current).toBe(true);
  });

  it('reacts when lightbox-open class is added', async () => {
    const { result } = renderHook(() => useLightboxOpen());
    expect(result.current).toBe(false);

    await act(async () => {
      document.documentElement.classList.add('lightbox-open');
      // MutationObserver fires asynchronously
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(result.current).toBe(true);
  });

  it('reacts when lightbox-open class is removed', async () => {
    document.documentElement.classList.add('lightbox-open');
    const { result } = renderHook(() => useLightboxOpen());
    expect(result.current).toBe(true);

    await act(async () => {
      document.documentElement.classList.remove('lightbox-open');
      await new Promise(resolve => setTimeout(resolve, 10));
    });
    expect(result.current).toBe(false);
  });

  it('disconnects observer on unmount', () => {
    const disconnectSpy = vi.fn();
    const originalMutationObserver = global.MutationObserver;

    // Must use a proper class constructor, not a plain function
    class MockMutationObserver {
      constructor(public callback: MutationCallback) {}
      observe = vi.fn();
      disconnect = disconnectSpy;
      takeRecords = vi.fn().mockReturnValue([]);
    }

    global.MutationObserver = MockMutationObserver as unknown as typeof MutationObserver;

    const { unmount } = renderHook(() => useLightboxOpen());
    unmount();

    expect(disconnectSpy).toHaveBeenCalled();
    global.MutationObserver = originalMutationObserver;
  });
});
