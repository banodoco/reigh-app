import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useScrollFade } from '../useScrollFade';

describe('useScrollFade', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
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
