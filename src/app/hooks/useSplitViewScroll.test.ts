import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSplitViewScroll } from './useSplitViewScroll';

describe('useSplitViewScroll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'scrollY', {
      value: 120,
      writable: true,
      configurable: true,
    });
    window.scrollTo = vi.fn();
  });

  it('restores scroll positions when toggling split view', () => {
    const { result, rerender } = renderHook(
      ({ isMobileSplitView }) => useSplitViewScroll(isMobileSplitView),
      { initialProps: { isMobileSplitView: false } }
    );

    const wrapper = document.createElement('div');
    wrapper.scrollTop = 0;
    act(() => {
      result.current.splitViewWrapperRef.current = wrapper;
    });

    window.dispatchEvent(new Event('scroll'));

    act(() => {
      rerender({ isMobileSplitView: true });
    });
    expect(wrapper.scrollTop).toBe(120);

    wrapper.scrollTop = 240;
    wrapper.dispatchEvent(new Event('scroll'));

    act(() => {
      rerender({ isMobileSplitView: false });
    });
    expect(window.scrollTo).toHaveBeenCalledWith(0, 240);
  });

  it('handles app:scrollToTop event in split view mode', () => {
    const { result } = renderHook(() => useSplitViewScroll(true));

    const wrapper = document.createElement('div');
    const scrollToMock = vi.fn();
    wrapper.scrollTo = scrollToMock;
    act(() => {
      result.current.splitViewWrapperRef.current = wrapper;
    });

    act(() => {
      window.dispatchEvent(new CustomEvent('app:scrollToTop', { detail: { behavior: 'smooth' } }));
    });

    expect(scrollToMock).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
});
