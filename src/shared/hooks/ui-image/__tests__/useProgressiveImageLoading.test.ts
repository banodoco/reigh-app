import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/shared/lib/preloading', () => ({
  hasLoadedImage: vi.fn(() => false),
}));

import { useProgressiveImageLoading } from '../useProgressiveImageLoading';

describe('useProgressiveImageLoading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty set when images array is empty', () => {
    const { result } = renderHook(() =>
      useProgressiveImageLoading({
        images: [],
        page: 1,
        isMobile: false,
      })
    );

    expect(result.current.showImageIndices.size).toBe(0);
  });

  it('returns empty set when disabled', () => {
    const { result } = renderHook(() =>
      useProgressiveImageLoading({
        images: [{ id: '1', url: 'test.jpg' }],
        page: 1,
        enabled: false,
        isMobile: false,
      })
    );

    expect(result.current.showImageIndices.size).toBe(0);
  });

  it('shows all image indices immediately', () => {
    const images = [
      { id: '1', url: 'img1.jpg' },
      { id: '2', url: 'img2.jpg' },
      { id: '3', url: 'img3.jpg' },
    ];

    const { result } = renderHook(() =>
      useProgressiveImageLoading({
        images,
        page: 1,
        isMobile: false,
      })
    );

    expect(result.current.showImageIndices.size).toBe(3);
    expect(result.current.showImageIndices.has(0)).toBe(true);
    expect(result.current.showImageIndices.has(1)).toBe(true);
    expect(result.current.showImageIndices.has(2)).toBe(true);
  });

  it('returns empty set when lightbox is open', () => {
    const { result } = renderHook(() =>
      useProgressiveImageLoading({
        images: [{ id: '1', url: 'test.jpg' }],
        page: 1,
        isMobile: false,
        isLightboxOpen: true,
      })
    );

    expect(result.current.showImageIndices.size).toBe(0);
  });

  it('calls onImagesReady for empty images', () => {
    const onImagesReady = vi.fn();

    renderHook(() =>
      useProgressiveImageLoading({
        images: [],
        page: 1,
        isMobile: false,
        onImagesReady,
      })
    );

    expect(onImagesReady).toHaveBeenCalled();
  });

  it('handles page changes', () => {
    const images1 = [{ id: '1', url: 'img1.jpg' }];
    const images2 = [{ id: '2', url: 'img2.jpg' }, { id: '3', url: 'img3.jpg' }];

    const { result, rerender } = renderHook(
      ({ images, page }) =>
        useProgressiveImageLoading({
          images,
          page,
          isMobile: false,
        }),
      { initialProps: { images: images1, page: 1 } }
    );

    expect(result.current.showImageIndices.size).toBe(1);

    rerender({ images: images2, page: 2 });

    expect(result.current.showImageIndices.size).toBe(2);
  });
});
