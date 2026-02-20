import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  imageLoadingState: {} as Record<string, unknown>,
  stableMediaState: {} as Record<string, unknown>,
  stateHook: {} as Record<string, unknown>,
  shareGenerationState: {} as Record<string, unknown>,
  onMobileTap: vi.fn(),
  onOpenLightbox: vi.fn(),
  handleShare: vi.fn(),
  prefetchTaskData: vi.fn(),
  navigateToShot: vi.fn(),
  markAllViewed: vi.fn(),
}));

vi.mock('@/shared/components/ui/button', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
}));

vi.mock('@/shared/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/shared/components/DraggableImage', () => ({
  DraggableImage: ({
    children,
    onDoubleClick,
  }: {
    children: React.ReactNode;
    onDoubleClick?: () => void;
  }) => (
    <div data-testid="draggable-image" onDoubleClick={onDoubleClick}>
      {children}
    </div>
  ),
}));

vi.mock('@/shared/components/TimeStamp', () => ({
  TimeStamp: () => <div data-testid="timestamp" />,
}));

vi.mock('./MediaGalleryItem/components/ActionButtons', () => ({
  ActionButtons: () => <div data-testid="action-buttons" />,
}));

vi.mock('./MediaGalleryItem/components/InfoTooltip', () => ({
  InfoTooltip: () => <div data-testid="info-tooltip" />,
}));

vi.mock('./MediaGalleryItem/components/VideoContent', () => ({
  VideoContent: () => <div data-testid="video-content" />,
}));

vi.mock('./MediaGalleryItem/components/ImageContent', () => ({
  ImageContent: () => <div data-testid="image-content" />,
}));

vi.mock('./MediaGalleryItem/components/ShotActions', () => ({
  ShotActions: () => <div data-testid="shot-actions" />,
}));

vi.mock('./MediaGalleryItem/hooks/useShotActions', () => ({
  useShotActions: () => ({
    addToShot: vi.fn(),
    addToShotWithoutPosition: vi.fn(),
  }),
}));

vi.mock('./MediaGalleryItem/hooks/useImageLoading', () => ({
  useImageLoading: () => mocks.imageLoadingState,
}));

vi.mock('./MediaGalleryItem/hooks/useMediaGalleryItemState', () => ({
  useMediaGalleryItemState: () => mocks.stateHook,
}));

vi.mock('./MediaGalleryItem/hooks/useStableMediaUrls', () => ({
  useStableMediaUrls: () => mocks.stableMediaState,
}));

vi.mock('./MediaGalleryItem/hooks/useShotPositionChecks', () => ({
  useShotPositionChecks: () => ({
    isAlreadyPositionedInSelectedShot: false,
    isAlreadyAssociatedWithoutPosition: false,
    shouldShowAddWithoutPositionButton: true,
  }),
}));

vi.mock('@/shared/lib/dragDrop', () => ({
  setGenerationDragData: vi.fn(),
  createDragPreview: vi.fn(() => undefined),
}));

vi.mock('@/shared/components/CreateShotModal', () => ({
  default: () => <div data-testid="create-shot-modal" />,
}));

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProject: () => ({ selectedProjectId: 'project-1' }),
}));

vi.mock('@/shared/lib/toolConstants', () => ({
  TOOL_IDS: {
    TRAVEL_BETWEEN_IMAGES: 'travel-between-images',
  },
}));

vi.mock('@/shared/hooks/useShotNavigation', () => ({
  useShotNavigation: () => ({ navigateToShot: mocks.navigateToShot }),
}));

vi.mock('@/shared/hooks/useLastAffectedShot', () => ({
  useLastAffectedShot: () => ({ setLastAffectedShotId: vi.fn() }),
}));

vi.mock('@/shared/hooks/useQuickShotCreate', () => ({
  useQuickShotCreate: () => ({
    quickCreateSuccess: false,
    handleQuickCreateAndAdd: vi.fn(),
    handleQuickCreateSuccess: vi.fn(),
  }),
}));

vi.mock('@/shared/lib/aspectRatios', () => ({
  parseRatio: () => 16 / 9,
}));

vi.mock('@/shared/hooks/useTaskPrefetch', () => ({
  useTaskFromUnifiedCache: () => ({ data: { taskId: 'task-1' } }),
  usePrefetchTaskData: () => mocks.prefetchTaskData,
}));

vi.mock('@/shared/hooks/useTaskType', () => ({
  useTaskType: () => ({ data: { content_type: 'video' } }),
}));

vi.mock('@/shared/hooks/useTasks', () => ({
  useGetTask: () => ({ data: { taskType: 'video_task' } }),
}));

vi.mock('@/shared/hooks/useShareGeneration', () => ({
  useShareGeneration: () => mocks.shareGenerationState,
}));

vi.mock('./MediaGallery/utils', () => ({
  deriveInputImages: () => [],
}));

vi.mock('@/shared/utils/taskParamsUtils', () => ({
  isImageEditTaskType: () => false,
}));

vi.mock('@/shared/components/VariantBadge', () => ({
  VariantBadge: () => <div data-testid="variant-badge" />,
}));

vi.mock('@/shared/hooks/useMarkVariantViewed', () => ({
  useMarkVariantViewed: () => ({ markAllViewed: mocks.markAllViewed }),
}));

vi.mock('@/shared/lib/mediaTypeHelpers', () => ({
  getGenerationId: (image: { generation_id?: string; id?: string }) => image.generation_id ?? image.id ?? '',
}));

import { MediaGalleryItem } from './MediaGalleryItem';

describe('MediaGalleryItem', () => {
  const baseImage = {
    id: 'gen-1',
    generation_id: 'gen-1',
    url: 'https://example.com/image.png',
    thumbUrl: 'https://example.com/image-thumb.png',
    type: 'image',
    location: 'remote',
    metadata: { tool_type: 'image-generation' },
    shot_id: 'shot-1',
    createdAt: '2025-01-01T00:00:00.000Z',
  };

  const baseProps = {
    image: baseImage,
    index: 0,
    isDeleting: false,
    onDelete: vi.fn(),
    onOpenLightbox: mocks.onOpenLightbox,
    onAddToLastShot: vi.fn().mockResolvedValue(true),
    onAddToLastShotWithoutPosition: vi.fn().mockResolvedValue(true),
    onToggleStar: vi.fn(),
    selectedShotIdLocal: 'shot-1',
    simplifiedShotOptions: [{ id: 'shot-1', name: 'Shot 1', created_at: '2025-01-01', settings: {} }],
    showTickForImageId: null,
    onShowTick: vi.fn(),
    onShowSecondaryTick: vi.fn(),
    optimisticUnpositionedIds: new Set<string>(),
    optimisticPositionedIds: new Set<string>(),
    onOptimisticUnpositioned: vi.fn(),
    onOptimisticPositioned: vi.fn(),
    addingToShotImageId: null,
    setAddingToShotImageId: vi.fn(),
    addingToShotWithoutPositionImageId: null,
    setAddingToShotWithoutPositionImageId: vi.fn(),
    onDownloadImage: vi.fn(),
    downloadingImageId: null,
    isMobile: false,
    mobileActiveImageId: null,
    mobilePopoverOpenImageId: null,
    onMobileTap: mocks.onMobileTap,
    setMobilePopoverOpenImageId: vi.fn(),
    setSelectedShotIdLocal: vi.fn(),
    setLastAffectedShotId: vi.fn(),
    toggleStarMutation: { mutate: vi.fn() },
    onCreateShot: vi.fn(),
    currentViewingShotId: 'shot-1',
    projectAspectRatio: '16:9',
    showShare: true,
    showDelete: true,
    showEdit: true,
    showStar: true,
    showAddToShot: true,
    enableSingleClick: false,
    onImageClick: vi.fn(),
    videosAsThumbnails: false,
    dataTour: 'media-gallery-item',
    onImageLoaded: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    mocks.onOpenLightbox = vi.fn();
    mocks.onMobileTap = vi.fn();
    mocks.handleShare = vi.fn();
    mocks.prefetchTaskData = vi.fn();
    mocks.navigateToShot = vi.fn();
    mocks.markAllViewed = vi.fn();

    mocks.shareGenerationState = {
      handleShare: mocks.handleShare,
      isCreatingShare: false,
      shareCopied: false,
      shareSlug: 'slug-1',
    };

    mocks.stateHook = {
      localStarred: false,
      setLocalStarred: vi.fn(),
      isTogglingStar: false,
      setIsTogglingStar: vi.fn(),
      isInfoOpen: false,
      setIsInfoOpen: vi.fn(),
      isShotSelectorOpen: false,
      setIsShotSelectorOpen: vi.fn(),
      isDragging: false,
      setIsDragging: vi.fn(),
      isCreateShotModalOpen: false,
      setIsCreateShotModalOpen: vi.fn(),
      isCreatingShot: false,
      handleCreateShot: vi.fn(),
    };

    mocks.stableMediaState = {
      isVideoContent: false,
      displayUrl: 'https://example.com/image.png',
      stableDisplayUrl: 'https://example.com/image.png',
      stableVideoUrl: null,
      progressiveEnabled: false,
      isThumbShowing: false,
      isFullLoaded: true,
      progressiveRef: { current: null },
    };

    mocks.imageLoadingState = {
      actualSrc: 'https://example.com/image.png',
      actualDisplayUrl: 'https://example.com/image.png',
      imageLoaded: true,
      imageLoadError: false,
      handleImageLoad: vi.fn(),
      handleImageError: vi.fn(),
      retryImageLoad: vi.fn(),
      setImageLoading: vi.fn(),
    };
  });

  it('renders placeholder branch when image id is missing and display is placeholder', () => {
    mocks.imageLoadingState.actualDisplayUrl = '/placeholder.svg';
    const placeholderImage = {
      ...baseImage,
      id: '',
    };

    const { container } = render(<MediaGalleryItem {...baseProps} image={placeholderImage} />);
    expect(container.querySelector('.animate-pulse')).not.toBeNull();
    expect(screen.queryByTestId('draggable-image')).toBeNull();
  });

  it('wraps non-mobile content in DraggableImage and opens lightbox on double click', () => {
    const { getByTestId } = render(<MediaGalleryItem {...baseProps} onOpenLightbox={mocks.onOpenLightbox} />);

    const draggable = getByTestId('draggable-image');
    fireEvent.doubleClick(draggable);
    expect(mocks.onOpenLightbox).toHaveBeenCalledWith(expect.objectContaining({ id: 'gen-1' }));
    expect(screen.getByTestId('image-content')).toBeInTheDocument();
  });

  it('handles mobile tap interaction for image content', () => {
    const mobileProps = {
      ...baseProps,
      isMobile: true,
      enableSingleClick: false,
      onMobileTap: mocks.onMobileTap,
    };

    const { container } = render(<MediaGalleryItem {...mobileProps} />);
    const touchTarget = container.querySelector('[data-tour="media-gallery-item"]');
    expect(touchTarget).not.toBeNull();

    fireEvent.touchStart(touchTarget as Element, { touches: [{ clientX: 10, clientY: 10 }] });
    fireEvent.touchEnd(touchTarget as Element, { changedTouches: [{ clientX: 10, clientY: 10 }] });

    expect(mocks.onMobileTap).toHaveBeenCalledWith(expect.objectContaining({ id: 'gen-1' }));
  });
});
