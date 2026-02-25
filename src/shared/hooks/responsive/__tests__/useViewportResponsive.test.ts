import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useViewportResponsive } from '../useViewportResponsive';

describe('useViewportResponsive', () => {
  it('uses viewport size as content dimensions', () => {
    const { result } = renderHook(() => useViewportResponsive());

    expect(result.current.contentWidth).toBe(window.innerWidth);
    expect(result.current.contentHeight).toBe(window.innerHeight);
  });

  it('calculates breakpoints from viewport width', () => {
    const { result } = renderHook(() => useViewportResponsive());
    const width = window.innerWidth;

    expect(result.current.isSm).toBe(width >= 640);
    expect(result.current.isMd).toBe(width >= 768);
    expect(result.current.isLg).toBe(width >= 1024);
    expect(result.current.isXl).toBe(width >= 1280);
    expect(result.current.is2Xl).toBe(width >= 1536);
  });

  it('updates dimensions on resize', () => {
    const originalWidth = window.innerWidth;
    const originalHeight = window.innerHeight;

    const { result } = renderHook(() => useViewportResponsive());

    act(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 900 });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 700 });
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.contentWidth).toBe(900);
    expect(result.current.contentHeight).toBe(700);

    act(() => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalHeight });
      window.dispatchEvent(new Event('resize'));
    });
  });
});
