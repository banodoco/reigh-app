import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

// Mock dependencies
vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: vi.fn(() => false),
}));

vi.mock('@/shared/lib/safeArea', () => ({
  safeAreaCalc: Object.assign(
    (base: string, inset: string) => `calc(${base} + env(safe-area-inset-${inset}, 0px))`,
    {
      maxHeight: (offset: string, fallback: string) =>
        `calc(${fallback} - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - ${offset})`,
      verticalCenter: () =>
        `calc(50% + env(safe-area-inset-top, 0px) / 2 - env(safe-area-inset-bottom, 0px) / 2)`,
    }
  ),
}));

import { useModal, useMediumModal, useLargeModal, useExtraLargeModal } from '../useModal';
import { useIsMobile } from '@/shared/hooks/mobile';

const mockUseIsMobile = vi.mocked(useIsMobile);

describe('useModal', () => {
  beforeEach(() => {
    mockUseIsMobile.mockReturnValue(false);
  });

  it('returns desktop styling for medium size by default', () => {
    const { result } = renderHook(() => useModal());

    expect(result.current.isMobile).toBe(false);
    expect(result.current.className).toContain('sm:max-w-[425px]');
    expect(result.current.className).toContain('bg-white');
    expect(result.current.style).toEqual({});
  });

  it('returns small modal class', () => {
    const { result } = renderHook(() => useModal('small'));

    expect(result.current.className).toContain('sm:max-w-sm');
  });

  it('returns large modal class', () => {
    const { result } = renderHook(() => useModal('large'));

    expect(result.current.className).toContain('sm:max-w-2xl');
    expect(result.current.className).toContain('max-h-[90vh]');
  });

  it('returns extra-large modal class', () => {
    const { result } = renderHook(() => useModal('extra-large'));

    expect(result.current.className).toContain('max-w-4xl');
  });

  it('returns mobile-specific styles when on mobile', () => {
    mockUseIsMobile.mockReturnValue(true);

    const { result } = renderHook(() => useModal('medium'));

    expect(result.current.isMobile).toBe(true);
    expect(result.current.style).toHaveProperty('width', 'calc(100vw - 2rem)');
    expect(result.current.style).toHaveProperty('maxHeight');
  });

  it('does not apply mobile styles for small modals on mobile', () => {
    mockUseIsMobile.mockReturnValue(true);

    const { result } = renderHook(() => useModal('small'));

    expect(result.current.isMobile).toBe(true);
    expect(result.current.style).toEqual({});
  });

  it('applies top positioning for large modals on mobile', () => {
    mockUseIsMobile.mockReturnValue(true);

    const { result } = renderHook(() => useModal('large'));

    expect(result.current.style).toHaveProperty('top');
  });

  it('provides standard section classes', () => {
    const { result } = renderHook(() => useModal());

    expect(result.current.headerClass).toBe('flex-shrink-0');
    expect(result.current.scrollClass).toContain('overflow-y-auto');
    expect(result.current.footerClass).toBe('flex-shrink-0');
  });
});

describe('convenience hooks', () => {
  it('useMediumModal returns medium size', () => {
    const { result } = renderHook(() => useMediumModal());
    expect(result.current.className).toContain('sm:max-w-[425px]');
  });

  it('useLargeModal returns large size', () => {
    const { result } = renderHook(() => useLargeModal());
    expect(result.current.className).toContain('sm:max-w-2xl');
  });

  it('useExtraLargeModal returns extra-large size', () => {
    const { result } = renderHook(() => useExtraLargeModal());
    expect(result.current.className).toContain('max-w-4xl');
  });
});
