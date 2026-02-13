import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollFade } from '../useScrollFade';

describe('useScrollFade', () => {
  let mockResizeObserver: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; unobserve: ReturnType<typeof vi.fn> };
  let mockMutationObserver: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn>; takeRecords: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.useFakeTimers();

    mockResizeObserver = {
      observe: vi.fn(),
      disconnect: vi.fn(),
      unobserve: vi.fn(),
    };

    mockMutationObserver = {
      observe: vi.fn(),
      disconnect: vi.fn(),
      takeRecords: vi.fn(),
    };

    vi.stubGlobal('ResizeObserver', vi.fn(() => mockResizeObserver));
    vi.stubGlobal('MutationObserver', vi.fn(() => mockMutationObserver));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('starts with showFade=false by default', () => {
    const { result } = renderHook(() => useScrollFade());
    expect(result.current.showFade).toBe(false);
  });

  it('starts with showFade=true when preloadFade and isOpen', () => {
    const { result } = renderHook(() =>
      useScrollFade({ preloadFade: true, isOpen: true })
    );
    expect(result.current.showFade).toBe(true);
  });

  it('returns a scrollRef', () => {
    const { result } = renderHook(() => useScrollFade());
    expect(result.current.scrollRef).toBeDefined();
    expect(result.current.scrollRef.current).toBeNull();
  });

  it('does not show fade when not open', () => {
    const { result } = renderHook(() =>
      useScrollFade({ isOpen: false, preloadFade: true })
    );
    expect(result.current.showFade).toBe(false);
  });
});
