import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBottomOffset } from './useBottomOffset';

const mockUsePanes = vi.fn();
const mockUseLightboxOpen = vi.fn();

vi.mock('@/shared/contexts/PanesContext', () => ({
  usePanes: () => mockUsePanes(),
}));

vi.mock('@/domains/media-lightbox/state/lightboxOpenState', () => ({
  useLightboxOpenState: () => mockUseLightboxOpen(),
}));

describe('useBottomOffset', () => {
  it('returns generationsPaneHeight when pane is locked', () => {
    mockUsePanes.mockReturnValue({
      isGenerationsPaneLocked: true,
      isGenerationsPaneOpen: false,
      generationsPaneHeight: 250,
    });
    mockUseLightboxOpen.mockReturnValue(false);

    const { result } = renderHook(() => useBottomOffset());
    expect(result.current).toBe(250);
  });

  it('returns generationsPaneHeight when pane is open', () => {
    mockUsePanes.mockReturnValue({
      isGenerationsPaneLocked: false,
      isGenerationsPaneOpen: true,
      generationsPaneHeight: 300,
    });
    mockUseLightboxOpen.mockReturnValue(false);

    const { result } = renderHook(() => useBottomOffset());
    expect(result.current).toBe(300);
  });

  it('returns 0 when pane is neither locked nor open', () => {
    mockUsePanes.mockReturnValue({
      isGenerationsPaneLocked: false,
      isGenerationsPaneOpen: false,
      generationsPaneHeight: 300,
    });
    mockUseLightboxOpen.mockReturnValue(false);

    const { result } = renderHook(() => useBottomOffset());
    expect(result.current).toBe(0);
  });

  it('returns 0 when lightbox is open regardless of pane state', () => {
    mockUsePanes.mockReturnValue({
      isGenerationsPaneLocked: true,
      isGenerationsPaneOpen: true,
      generationsPaneHeight: 400,
    });
    mockUseLightboxOpen.mockReturnValue(true);

    const { result } = renderHook(() => useBottomOffset());
    expect(result.current).toBe(0);
  });
});
