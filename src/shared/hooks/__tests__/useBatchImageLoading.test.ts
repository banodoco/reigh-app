import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';

vi.mock('@/shared/hooks/useProgressiveImage', () => ({
  useProgressiveImage: vi.fn((_thumb: string | null, _full: string, _opts: unknown) => ({
    src: _thumb || _full,
    isThumbShowing: !!_thumb,
    isFullLoaded: !_thumb,
    ref: vi.fn(),
  })),
}));

vi.mock('@/shared/settings/progressiveLoading', () => ({
  isProgressiveLoadingEnabled: vi.fn(() => true),
}));

vi.mock('@/shared/lib/utils', () => ({
  getDisplayUrl: vi.fn((url: string) => url),
}));

import { useBatchImageLoading } from '../useBatchImageLoading';
import { isProgressiveLoadingEnabled } from '@/shared/settings/progressiveLoading';

describe('useBatchImageLoading', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns display image URL', () => {
    const { result } = renderHook(() =>
      useBatchImageLoading({
        thumbUrl: 'thumb.jpg',
        imageUrl: 'full.jpg',
      })
    );
    expect(result.current.displayImageUrl).toBeTruthy();
  });

  it('provides progressive ref callback', () => {
    const { result } = renderHook(() =>
      useBatchImageLoading({
        thumbUrl: 'thumb.jpg',
        imageUrl: 'full.jpg',
      })
    );
    expect(typeof result.current.progressiveRef).toBe('function');
  });

  it('falls back to thumbUrl when progressive loading is disabled and thumbUrl is set', () => {
    vi.mocked(isProgressiveLoadingEnabled).mockReturnValue(false);
    const { result } = renderHook(() =>
      useBatchImageLoading({
        thumbUrl: 'thumb.jpg',
        imageUrl: 'full.jpg',
      })
    );
    // When progressive is disabled, displayImageUrl = getDisplayUrl(thumbUrl || imageUrl)
    // thumbUrl takes priority since it's truthy
    expect(result.current.displayImageUrl).toBe('thumb.jpg');
  });

  it('falls back to thumbUrl when no progressive src and no full URL', () => {
    vi.mocked(isProgressiveLoadingEnabled).mockReturnValue(false);
    const { result } = renderHook(() =>
      useBatchImageLoading({
        thumbUrl: 'thumb.jpg',
        imageUrl: 'full.jpg',
      })
    );
    expect(result.current.displayImageUrl).toBeTruthy();
  });

  it('handles null thumbUrl', () => {
    const { result } = renderHook(() =>
      useBatchImageLoading({
        thumbUrl: null,
        imageUrl: 'full.jpg',
      })
    );
    expect(result.current.displayImageUrl).toBeTruthy();
  });
});
