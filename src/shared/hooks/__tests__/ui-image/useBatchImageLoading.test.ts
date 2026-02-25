import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const { mockUseProgressiveImage, mockIsProgressiveLoadingEnabled, mockGetDisplayUrl } = vi.hoisted(() => ({
  mockUseProgressiveImage: vi.fn(),
  mockIsProgressiveLoadingEnabled: vi.fn(() => true),
  mockGetDisplayUrl: vi.fn((url: string) => `display:${url}`),
}));

vi.mock('@/shared/hooks/useProgressiveImage', () => ({
  useProgressiveImage: mockUseProgressiveImage,
}));

vi.mock('@/shared/settings/progressiveLoading', () => ({
  isProgressiveLoadingEnabled: mockIsProgressiveLoadingEnabled,
}));

vi.mock('@/shared/lib/mediaUrl', () => ({
  getDisplayUrl: mockGetDisplayUrl,
}));

import { useBatchImageLoading } from '@/shared/hooks/ui-image/useBatchImageLoading';
import { useProgressiveImage } from '@/shared/hooks/useProgressiveImage';
import { isProgressiveLoadingEnabled } from '@/shared/settings/progressiveLoading';
import { getDisplayUrl } from '@/shared/lib/mediaUrl';

describe('useBatchImageLoading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isProgressiveLoadingEnabled).mockReturnValue(true);
    vi.mocked(getDisplayUrl).mockImplementation((url: string) => `display:${url}`);
    vi.mocked(useProgressiveImage).mockReturnValue({
      src: 'progressive.jpg',
      isThumbShowing: true,
      isFullLoaded: false,
      ref: vi.fn(),
    });
  });

  it('uses progressive source when enabled and available', () => {
    const { result } = renderHook(() =>
      useBatchImageLoading({
        thumbUrl: 'thumb.jpg',
        imageUrl: 'full.jpg',
      })
    );

    expect(useProgressiveImage).toHaveBeenCalledWith(
      'thumb.jpg',
      'full.jpg',
      expect.objectContaining({
        priority: false,
        lazy: true,
        enabled: true,
        crossfadeMs: 200,
      })
    );
    expect(result.current.displayImageUrl).toBe('progressive.jpg');
    expect(result.current.isThumbShowing).toBe(true);
    expect(result.current.isFullLoaded).toBe(false);
    expect(typeof result.current.progressiveRef).toBe('function');
    expect(getDisplayUrl).not.toHaveBeenCalled();
  });

  it('falls back to thumb URL when progressive loading is disabled', () => {
    vi.mocked(isProgressiveLoadingEnabled).mockReturnValue(false);
    const { result } = renderHook(() =>
      useBatchImageLoading({
        thumbUrl: 'thumb.jpg',
        imageUrl: 'full.jpg',
      })
    );

    expect(useProgressiveImage).toHaveBeenCalledWith(
      null,
      'full.jpg',
      expect.objectContaining({ enabled: false })
    );
    expect(getDisplayUrl).toHaveBeenCalledWith('thumb.jpg');
    expect(result.current.displayImageUrl).toBe('display:thumb.jpg');
  });

  it('falls back to full URL when thumb URL is null', () => {
    vi.mocked(isProgressiveLoadingEnabled).mockReturnValue(false);
    const { result } = renderHook(() =>
      useBatchImageLoading({
        thumbUrl: null,
        imageUrl: 'full.jpg',
      })
    );

    expect(getDisplayUrl).toHaveBeenCalledWith('full.jpg');
    expect(result.current.displayImageUrl).toBe('display:full.jpg');
  });

  it('disables progressive loading when shouldLoad is false', () => {
    vi.mocked(useProgressiveImage).mockReturnValue({
      src: null,
      isThumbShowing: false,
      isFullLoaded: false,
      ref: vi.fn(),
    });

    const { result } = renderHook(() =>
      useBatchImageLoading({
        thumbUrl: 'thumb.jpg',
        imageUrl: 'full.jpg',
        shouldLoad: false,
      })
    );

    expect(useProgressiveImage).toHaveBeenCalledWith(
      'thumb.jpg',
      'full.jpg',
      expect.objectContaining({ enabled: false })
    );
    expect(result.current.displayImageUrl).toBe('display:thumb.jpg');
  });
});
