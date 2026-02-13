import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const mockUsePanes = vi.fn();

vi.mock('@/shared/contexts/PanesContext', () => ({
  usePanes: () => mockUsePanes(),
}));

import { useContentResponsive } from '../useContentResponsive';

describe('useContentResponsive', () => {
  beforeEach(() => {
    mockUsePanes.mockReturnValue({});
  });

  it('uses PanesContext contentBreakpoints when available with positive width', () => {
    mockUsePanes.mockReturnValue({
      contentBreakpoints: {
        isSm: true,
        isMd: true,
        isLg: false,
        isXl: false,
        is2Xl: false,
        contentWidth: 700,
        contentHeight: 500,
      },
    });

    const { result } = renderHook(() => useContentResponsive());
    expect(result.current.contentWidth).toBe(700);
    expect(result.current.isMd).toBe(true);
    expect(result.current.isLg).toBe(false);
  });

  it('falls back to viewport breakpoints when contentBreakpoints not available', () => {
    mockUsePanes.mockReturnValue({});

    // jsdom default window size
    const { result } = renderHook(() => useContentResponsive());
    expect(result.current.contentWidth).toBe(window.innerWidth);
    expect(result.current.contentHeight).toBe(window.innerHeight);
  });

  it('falls back when contentBreakpoints has zero width', () => {
    mockUsePanes.mockReturnValue({
      contentBreakpoints: {
        isSm: false,
        isMd: false,
        isLg: false,
        isXl: false,
        is2Xl: false,
        contentWidth: 0,
        contentHeight: 0,
      },
    });

    const { result } = renderHook(() => useContentResponsive());
    // Falls back to viewport
    expect(result.current.contentWidth).toBe(window.innerWidth);
  });

  it('calculates correct breakpoints for viewport fallback', () => {
    mockUsePanes.mockReturnValue({});

    // In jsdom, window.innerWidth is 1024 by default
    const { result } = renderHook(() => useContentResponsive());
    const width = window.innerWidth;

    expect(result.current.isSm).toBe(width >= 640);
    expect(result.current.isMd).toBe(width >= 768);
    expect(result.current.isLg).toBe(width >= 1024);
    expect(result.current.isXl).toBe(width >= 1280);
    expect(result.current.is2Xl).toBe(width >= 1536);
  });
});
