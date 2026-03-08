import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useMediaGalleryItemProps } from './useMediaGalleryItemProps';

function buildParams(overrides: Record<string, unknown> = {}) {
  return {
    simplifiedShotOptions: [{ id: 'shot-1', name: 'Shot 1' }],
    currentViewingShotId: 'shot-1',
    onCreateShot: vi.fn(),
    onAddToLastShot: vi.fn(),
    onAddToLastShotWithoutPosition: vi.fn(),
    showDelete: true,
    showDownload: true,
    showShare: false,
    showEdit: true,
    showStar: true,
    showAddToShot: true,
    enableSingleClick: false,
    videosAsThumbnails: true,
    onToggleStar: vi.fn(),
    onApplySettings: vi.fn(),
    onImageClick: vi.fn(),
    isDeleting: false,
    selectedShotIdLocal: 'shot-1',
    setSelectedShotIdLocal: vi.fn(),
    onShotChange: vi.fn(),
    showTickForImageId: null,
    onShowTick: vi.fn(),
    showTickForSecondaryImageId: null,
    onShowSecondaryTick: vi.fn(),
    optimisticUnpositionedIds: new Set<string>(),
    optimisticPositionedIds: new Set<string>(),
    optimisticDeletedIds: new Set<string>(),
    onOptimisticUnpositioned: vi.fn(),
    onOptimisticPositioned: vi.fn(),
    addingToShotImageId: null,
    setAddingToShotImageId: vi.fn(),
    addingToShotWithoutPositionImageId: null,
    setAddingToShotWithoutPositionImageId: vi.fn(),
    mobileActiveImageId: null,
    mobilePopoverOpenImageId: null,
    onMobileTap: vi.fn(),
    setMobilePopoverOpenImageId: vi.fn(),
    onOpenLightbox: vi.fn(),
    onDelete: vi.fn(),
    onDownloadImage: vi.fn(),
    activeLightboxMediaId: undefined,
    downloadingImageId: null,
    ...overrides,
  };
}

describe('useMediaGalleryItemProps', () => {
  it('builds shot/mobile/features/actions/loading bundles from provided params', () => {
    const params = buildParams({
      isDeleting: 'image-7',
      downloadingImageId: 'image-9',
      mobileActiveImageId: 'image-1',
    });

    const { result } = renderHook(() => useMediaGalleryItemProps(params as never));

    expect(result.current.itemShotWorkflow).toEqual(expect.objectContaining({
      selectedShotIdLocal: 'shot-1',
      simplifiedShotOptions: [{ id: 'shot-1', name: 'Shot 1' }],
      setLastAffectedShotId: params.onShotChange,
      onCreateShot: params.onCreateShot,
      onAddToLastShot: params.onAddToLastShot,
      onAddToLastShotWithoutPosition: params.onAddToLastShotWithoutPosition,
    }));
    expect(result.current.itemMobileInteraction).toEqual({
      mobileActiveImageId: 'image-1',
      mobilePopoverOpenImageId: null,
      onMobileTap: params.onMobileTap,
      setMobilePopoverOpenImageId: params.setMobilePopoverOpenImageId,
    });
    expect(result.current.itemFeatures).toEqual(expect.objectContaining({
      showDelete: true,
      showDownload: true,
      showEdit: true,
      showStar: true,
      showAddToShot: true,
      enableSingleClick: false,
      videosAsThumbnails: true,
    }));
    expect(result.current.itemActions).toEqual(expect.objectContaining({
      onOpenLightbox: params.onOpenLightbox,
      onDelete: params.onDelete,
      onApplySettings: params.onApplySettings,
      onDownloadImage: params.onDownloadImage,
      onToggleStar: params.onToggleStar,
      onImageClick: params.onImageClick,
    }));
    expect(result.current.itemLoading).toEqual({
      isDeleting: 'image-7',
      downloadingImageId: 'image-9',
    });
    expect(result.current.lightboxDeletingId).toBe('image-7');
  });

  it('disables star feature when no toggle handler is provided', () => {
    const params = buildParams({
      onToggleStar: undefined,
      showStar: true,
    });

    const { result } = renderHook(() => useMediaGalleryItemProps(params as never));

    expect(result.current.itemFeatures.showStar).toBe(false);
  });

  it('resolves lightbox deleting id for boolean deleting states using active media id', () => {
    const { result, rerender } = renderHook(
      (props: ReturnType<typeof buildParams>) => useMediaGalleryItemProps(props as never),
      {
        initialProps: buildParams({
          isDeleting: true,
          activeLightboxMediaId: 'lightbox-1',
        }),
      },
    );

    expect(result.current.lightboxDeletingId).toBe('lightbox-1');

    rerender(buildParams({
      isDeleting: true,
      activeLightboxMediaId: undefined,
    }));
    expect(result.current.lightboxDeletingId).toBeNull();

    rerender(buildParams({
      isDeleting: false,
      activeLightboxMediaId: 'lightbox-1',
    }));
    expect(result.current.lightboxDeletingId).toBeNull();
  });
});
