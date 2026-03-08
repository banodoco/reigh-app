import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useMediaGalleryViewInteractions } from './useMediaGalleryViewInteractions';

const mocks = vi.hoisted(() => ({
  useMediaGalleryHandlers: vi.fn(),
  useMobileInteractions: vi.fn(),
  useMediaGalleryItemProps: vi.fn(),
}));

vi.mock('./useMediaGalleryHandlers', () => ({
  useMediaGalleryHandlers: (...args: unknown[]) => mocks.useMediaGalleryHandlers(...args),
}));

vi.mock('./useMobileInteractions', () => ({
  useMobileInteractions: (...args: unknown[]) => mocks.useMobileInteractions(...args),
}));

vi.mock('./useMediaGalleryItemProps', () => ({
  useMediaGalleryItemProps: (...args: unknown[]) => mocks.useMediaGalleryItemProps(...args),
}));

describe('useMediaGalleryViewInteractions', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.useMediaGalleryHandlers.mockReturnValue({
      handleNavigateToShot: vi.fn(),
      handleVisitShotFromNotifier: vi.fn(),
      handleSwitchToAssociatedShot: vi.fn(),
      handleShowAllShots: vi.fn(),
      handleShowTaskDetails: vi.fn(),
    });
    mocks.useMobileInteractions.mockReturnValue({
      handleMobileTap: vi.fn(),
    });
    mocks.useMediaGalleryItemProps.mockReturnValue({
      itemShotWorkflow: { id: 'workflow' },
      itemMobileInteraction: { id: 'mobile' },
      itemFeatures: { id: 'features' },
      itemActions: { id: 'actions' },
      itemLoading: { id: 'loading' },
      lightboxDeletingId: 'delete-1',
    });
  });

  it('composes handler/mobile/item hooks and returns merged interaction API', () => {
    const params = {
      allShots: [{ id: 'shot-1' }],
      simplifiedShotOptions: [{ id: 'shot-1', name: 'Shot 1' }],
      navigateToShot: vi.fn(),
      actionsHook: {
        handleCloseLightbox: vi.fn(),
        handleOpenLightbox: vi.fn(),
        handleShotChange: vi.fn(),
        handleShowTick: vi.fn(),
        handleShowSecondaryTick: vi.fn(),
        handleOptimisticDelete: vi.fn(),
        handleDownloadImage: vi.fn(),
      },
      formAssociatedShotId: 'shot-1',
      onSwitchToAssociatedShot: vi.fn(),
      filtersHook: {
        setShotFilter: vi.fn(),
      },
      stateHook: {
        state: {
          activeLightboxMedia: { id: 'img-1' },
          mobilePopoverOpenImageId: null,
          selectedShotIdLocal: 'shot-1',
          showTickForImageId: null,
          showTickForSecondaryImageId: null,
          optimisticUnpositionedIds: new Set<string>(),
          optimisticPositionedIds: new Set<string>(),
          optimisticDeletedIds: new Set<string>(),
          addingToShotImageId: null,
          addingToShotWithoutPositionImageId: null,
          mobileActiveImageId: null,
        },
        setSelectedImageForDetails: vi.fn(),
        setShowTaskDetailsModal: vi.fn(),
        setActiveLightboxMedia: vi.fn(),
        setMobileActiveImageId: vi.fn(),
        setMobilePopoverOpenImageId: vi.fn(),
        setSelectedShotIdLocal: vi.fn(),
        markOptimisticUnpositioned: vi.fn(),
        markOptimisticPositioned: vi.fn(),
        setAddingToShotImageId: vi.fn(),
        setAddingToShotWithoutPositionImageId: vi.fn(),
      },
      isMobile: true,
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
      currentViewingShotId: 'shot-1',
      activeLightboxMediaId: 'img-1',
      downloadingImageId: 'img-2',
    };

    const { result } = renderHook(() => useMediaGalleryViewInteractions(params as never));

    expect(mocks.useMediaGalleryHandlers).toHaveBeenCalledWith(expect.objectContaining({
      allShots: params.allShots,
      simplifiedShotOptions: params.simplifiedShotOptions,
      navigateToShot: params.navigateToShot,
      closeLightbox: params.actionsHook.handleCloseLightbox,
      formAssociatedShotId: 'shot-1',
      onSwitchToAssociatedShot: params.onSwitchToAssociatedShot,
      setShotFilter: params.filtersHook.setShotFilter,
      activeLightboxMedia: params.stateHook.state.activeLightboxMedia,
    }));
    expect(mocks.useMobileInteractions).toHaveBeenCalledWith({
      isMobile: true,
      setMobileActiveImageId: params.stateHook.setMobileActiveImageId,
      mobilePopoverOpenImageId: null,
      setMobilePopoverOpenImageId: params.stateHook.setMobilePopoverOpenImageId,
      onOpenLightbox: params.actionsHook.handleOpenLightbox,
    });
    expect(mocks.useMediaGalleryItemProps).toHaveBeenCalledWith(expect.objectContaining({
      simplifiedShotOptions: params.simplifiedShotOptions,
      currentViewingShotId: 'shot-1',
      onCreateShot: params.onCreateShot,
      onAddToLastShot: params.onAddToLastShot,
      onAddToLastShotWithoutPosition: params.onAddToLastShotWithoutPosition,
      onOpenLightbox: params.actionsHook.handleOpenLightbox,
      onDelete: params.actionsHook.handleOptimisticDelete,
      onDownloadImage: params.actionsHook.handleDownloadImage,
      onMobileTap: mocks.useMobileInteractions.mock.results[0].value.handleMobileTap,
      activeLightboxMediaId: 'img-1',
      downloadingImageId: 'img-2',
    }));

    expect(result.current).toEqual(expect.objectContaining({
      itemShotWorkflow: { id: 'workflow' },
      itemMobileInteraction: { id: 'mobile' },
      itemFeatures: { id: 'features' },
      itemActions: { id: 'actions' },
      itemLoading: { id: 'loading' },
      lightboxDeletingId: 'delete-1',
      handleNavigateToShot: mocks.useMediaGalleryHandlers.mock.results[0].value.handleNavigateToShot,
      handleShowTaskDetails: mocks.useMediaGalleryHandlers.mock.results[0].value.handleShowTaskDetails,
    }));
  });
});
