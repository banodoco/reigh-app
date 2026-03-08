import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePaginatedImagesWithBadges } from './usePaginatedImagesWithBadges';

const mocks = vi.hoisted(() => ({
  useVariantBadges: vi.fn(),
  getGenerationId: vi.fn(),
}));

vi.mock('@/shared/hooks/variants/useVariantBadges', () => ({
  useVariantBadges: (...args: unknown[]) => mocks.useVariantBadges(...args),
}));

vi.mock('@/shared/lib/media/mediaTypeHelpers', () => ({
  getGenerationId: (...args: unknown[]) => mocks.getGenerationId(...args),
}));

describe('usePaginatedImagesWithBadges', () => {
  it('uses generation ids from paginated images and returns empty list when images are undefined', () => {
    mocks.useVariantBadges.mockReturnValue({
      getBadgeData: vi.fn(),
      isLoading: false,
    });
    mocks.getGenerationId.mockImplementation((image: { id?: string } | undefined) => image?.id ?? null);

    const { result } = renderHook(() =>
      usePaginatedImagesWithBadges({ paginatedImages: undefined }),
    );

    expect(mocks.useVariantBadges).toHaveBeenCalledWith([]);
    expect(result.current.paginatedImagesWithBadges).toEqual([]);
    expect(result.current.isBadgeDataLoading).toBe(false);
  });

  it('removes badge fields while badge data is loading', () => {
    mocks.getGenerationId.mockImplementation((image: { id?: string } | undefined) => image?.id ?? null);
    mocks.useVariantBadges.mockReturnValue({
      getBadgeData: vi.fn(),
      isLoading: true,
    });
    const images = [
      {
        id: 'gen-1',
        derivedCount: 9,
        hasUnviewedVariants: true,
        unviewedVariantCount: 2,
        prompt: 'one',
      },
    ] as never;

    const { result } = renderHook(() =>
      usePaginatedImagesWithBadges({ paginatedImages: images }),
    );

    expect(result.current.isBadgeDataLoading).toBe(true);
    expect(result.current.paginatedImagesWithBadges[0]).toEqual({
      id: 'gen-1',
      prompt: 'one',
    });
  });

  it('applies badge data when loaded and uses default badge values without generation id', () => {
    const getBadgeData = vi.fn((id: string) =>
      id === 'gen-1'
        ? { derivedCount: 5, hasUnviewedVariants: true, unviewedVariantCount: 1 }
        : { derivedCount: 0, hasUnviewedVariants: false, unviewedVariantCount: 0 },
    );
    mocks.useVariantBadges.mockReturnValue({
      getBadgeData,
      isLoading: false,
    });
    mocks.getGenerationId.mockImplementation((image: { id?: string } | undefined) =>
      image?.id?.startsWith('gen') ? image.id : null,
    );
    const images = [
      { id: 'gen-1', prompt: 'first' },
      { id: 'local-temp', prompt: 'second' },
    ] as never;

    const { result } = renderHook(() =>
      usePaginatedImagesWithBadges({ paginatedImages: images }),
    );

    expect(mocks.useVariantBadges).toHaveBeenCalledWith(['gen-1']);
    expect(getBadgeData).toHaveBeenCalledWith('gen-1');
    expect(result.current.paginatedImagesWithBadges).toEqual([
      expect.objectContaining({
        id: 'gen-1',
        derivedCount: 5,
        hasUnviewedVariants: true,
        unviewedVariantCount: 1,
      }),
      expect.objectContaining({
        id: 'local-temp',
        derivedCount: 0,
        hasUnviewedVariants: false,
        unviewedVariantCount: 0,
      }),
    ]);
  });
});
