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

vi.mock('../MediaGalleryItem/components/ActionButtons', () => ({
  ActionButtons: () => <div data-testid="action-buttons" />,
}));

vi.mock('../MediaGalleryItem/components/InfoTooltip', () => ({
  InfoTooltip: () => <div data-testid="info-tooltip" />,
}));

vi.mock('../MediaGalleryItem/components/VideoContent', () => ({
  VideoContent: () => <div data-testid="video-content" />,
}));

vi.mock('../MediaGalleryItem/components/ImageContent', () => ({
  ImageContent: () => <div data-testid="image-content" />,
}));

vi.mock('../MediaGalleryItem/components/ShotActions', () => ({
  ShotActions: () => <div data-testid="shot-actions" />,
}));

vi.mock('../MediaGalleryItem/hooks/useShotActions', () => ({
  useShotActions: () => ({
    addToShot: vi.fn(),
    addToShotWithoutPosition: vi.fn(),
  }),
}));

vi.mock('../MediaGalleryItem/hooks/useImageLoading', () => ({
  useImageLoading: () => mocks.imageLoadingState,
}));

vi.mock('../MediaGalleryItem/hooks/useMediaGalleryItemState', () => ({
  useMediaGalleryItemState: () => mocks.stateHook,
}));

vi.mock('../MediaGalleryItem/hooks/useStableMediaUrls', () => ({
  useStableMediaUrls: () => mocks.stableMediaState,
}));

vi.mock('../MediaGalleryItem/hooks/useShotPositionChecks', () => ({
  useShotPositionChecks: () => ({
    isAlreadyPositionedInSelectedShot: false,
    isAlreadyAssociatedWithoutPosition: false,
    shouldShowAddWithoutPositionButton: true,
  }),
}));

vi.mock('@/shared/lib/dnd/dragDrop', () => ({
  setGenerationDragData: vi.fn(),
  createDragPreview: vi.fn(() => undefined),
}));

vi.mock('@/features/shots/components/CreateShotModal', () => ({
  default: () => <div data-testid="create-shot-modal" />,
}));

vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProjectSelectionContext: () => ({ selectedProjectId: 'project-1' }),
}));

vi.mock('@/shared/lib/toolIds', () => ({
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

vi.mock('@/shared/lib/media/aspectRatios', () => ({
  parseRatio: () => 16 / 9,
}));

vi.mock('@/shared/hooks/tasks/useTaskPrefetch', () => ({
  useTaskFromUnifiedCache: () => ({ data: { taskId: 'task-1' } }),
  usePrefetchTaskData: () => mocks.prefetchTaskData,
}));

vi.mock('@/shared/hooks/tasks/useTaskType', () => ({
  useTaskType: () => ({ data: { content_type: 'video' } }),
}));

vi.mock('@/shared/hooks/tasks/useTasks', () => ({
  useGetTask: () => ({ data: { taskType: 'video_task' } }),
}));

vi.mock('@/shared/hooks/useShareGeneration', () => ({
  useShareGeneration: () => mocks.shareGenerationState,
}));

vi.mock('../MediaGallery/utils', () => ({
  deriveGalleryInputImages: () => [],
}));

vi.mock('@/shared/lib/taskParamsUtils', () => ({
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

import { MediaGalleryItem } from '../MediaGalleryItem';

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
    shotWorkflow: {
      selectedShotIdLocal: 'shot-1',
      simplifiedShotOptions: [{ id: 'shot-1', name: 'Shot 1' }],
      setSelectedShotIdLocal: vi.fn(),
      setLastAffectedShotId: vi.fn(),
      showTickForImageId: null as string | null,
      onShowTick: vi.fn(),
      onShowSecondaryTick: vi.fn(),
      optimisticUnpositionedIds: new Set<string>(),
      optimisticPositionedIds: new Set<string>(),
      onOptimisticUnpositioned: vi.fn(),
      onOptimisticPositioned: vi.fn(),
      addingToShotImageId: null as string | null,
      setAddingToShotImageId: vi.fn(),
      addingToShotWithoutPositionImageId: null as string | null,
      setAddingToShotWithoutPositionImageId: vi.fn(),
      currentViewingShotId: 'shot-1',
      onCreateShot: vi.fn(),
      onAddToLastShot: vi.fn().mockResolvedValue(true),
      onAddToLastShotWithoutPosition: vi.fn().mockResolvedValue(true),
    },
    mobileInteraction: {
      isMobile: false,
      mobileActiveImageId: null as string | null,
      mobilePopoverOpenImageId: null as string | null,
      onMobileTap: mocks.onMobileTap,
      setMobilePopoverOpenImageId: vi.fn(),
    },
    features: {
      showShare: true,
      showDelete: true,
      showEdit: true,
      showStar: true,
      showAddToShot: true,
      enableSingleClick: false,
      videosAsThumbnails: false,
    },
    actions: {
      onOpenLightbox: mocks.onOpenLightbox,
      onDelete: vi.fn(),
      onDownloadImage: vi.fn(),
      onToggleStar: vi.fn(),
      onImageClick: vi.fn(),
      toggleStarMutation: { mutate: vi.fn() },
      onImageLoaded: vi.fn(),
    },
    loading: {
      isDeleting: false as string | boolean | null | undefined,
      downloadingImageId: null as string | null,
    },
    projectAspectRatio: '16:9',
    dataTour: 'media-gallery-item',
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
    const propsWithLightbox = {
      ...baseProps,
      actions: { ...baseProps.actions, onOpenLightbox: mocks.onOpenLightbox },
    };
    const { getByTestId } = render(<MediaGalleryItem {...propsWithLightbox} />);

    const draggable = getByTestId('draggable-image');
    fireEvent.doubleClick(draggable);
    expect(mocks.onOpenLightbox).toHaveBeenCalledWith(expect.objectContaining({ id: 'gen-1' }));
    expect(screen.getByTestId('image-content')).toBeInTheDocument();
  });

  it('handles mobile tap interaction for image content', () => {
    const mobileProps = {
      ...baseProps,
      mobileInteraction: {
        ...baseProps.mobileInteraction,
        isMobile: true,
        onMobileTap: mocks.onMobileTap,
      },
      features: {
        ...baseProps.features,
        enableSingleClick: false,
      },
    };

    const { container } = render(<MediaGalleryItem {...mobileProps} />);
    const touchTarget = container.querySelector('[data-tour="media-gallery-item"]');
    expect(touchTarget).not.toBeNull();

    fireEvent.touchStart(touchTarget as Element, { touches: [{ clientX: 10, clientY: 10 }] });
    fireEvent.touchEnd(touchTarget as Element, { changedTouches: [{ clientX: 10, clientY: 10 }] });

    expect(mocks.onMobileTap).toHaveBeenCalledWith(expect.objectContaining({ id: 'gen-1' }));
  });
});
