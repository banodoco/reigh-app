import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaGalleryItem } from './MediaGalleryItem';

const mocks = vi.hoisted(() => ({
  useMediaGalleryItemShotActions: vi.fn(),
  useImageLoading: vi.fn(),
  useMediaGalleryItemState: vi.fn(),
  useStableMediaUrls: vi.fn(),
  useShotPositionChecks: vi.fn(),
  useItemInteraction: vi.fn(),
  useProjectSelectionContext: vi.fn(),
  useShotNavigation: vi.fn(),
  useLastAffectedShot: vi.fn(),
  useQuickShotCreate: vi.fn(),
  useTaskFromUnifiedCache: vi.fn(),
  usePrefetchTaskData: vi.fn(),
  useTaskType: vi.fn(),
  useGetTask: vi.fn(),
  useShareGeneration: vi.fn(),
  useMarkVariantViewed: vi.fn(),
  resolveAspectRatioPadding: vi.fn(),
  setGenerationDragData: vi.fn(),
  createDragPreview: vi.fn(),
  deriveGalleryInputImages: vi.fn(),
  isImageEditTaskType: vi.fn(),
  getGenerationId: vi.fn(),
}));

vi.mock('lucide-react', () => ({
  Eye: () => <svg data-testid="icon-eye" />,
}));

vi.mock('@/shared/components/DraggableImage', () => ({
  DraggableImage: ({ children }: { children: unknown }) => <div data-testid="draggable">{children}</div>,
}));
vi.mock('@/shared/components/TimeStamp', () => ({
  TimeStamp: () => <div data-testid="timestamp" />,
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
vi.mock('./MediaGalleryItem/components/ActionButtons', () => ({
  ActionButtons: () => <div data-testid="action-buttons" />,
}));
vi.mock('./MediaGalleryItem/components/ItemShotBadges', () => ({
  ItemShotBadges: () => <div data-testid="item-shot-badges" />,
}));
vi.mock('./MediaGalleryItem/components/ItemMetadataBar', () => ({
  ItemMetadataBar: () => <div data-testid="item-metadata-bar" />,
}));
vi.mock('@/shared/components/shots/CreateShotModal', () => ({
  CreateShotModal: () => <div data-testid="create-shot-modal" />,
}));

vi.mock('./MediaGalleryItem/hooks/useShotActions', () => ({
  useMediaGalleryItemShotActions: (...args: unknown[]) => mocks.useMediaGalleryItemShotActions(...args),
}));
vi.mock('./MediaGalleryItem/hooks/useImageLoading', () => ({
  useImageLoading: (...args: unknown[]) => mocks.useImageLoading(...args),
}));
vi.mock('./MediaGalleryItem/hooks/useMediaGalleryItemState', () => ({
  useMediaGalleryItemState: (...args: unknown[]) => mocks.useMediaGalleryItemState(...args),
}));
vi.mock('./MediaGalleryItem/hooks/useStableMediaUrls', () => ({
  useStableMediaUrls: (...args: unknown[]) => mocks.useStableMediaUrls(...args),
}));
vi.mock('./MediaGalleryItem/hooks/useShotPositionChecks', () => ({
  useShotPositionChecks: (...args: unknown[]) => mocks.useShotPositionChecks(...args),
}));
vi.mock('./MediaGalleryItem/hooks/useItemInteraction', () => ({
  useItemInteraction: (...args: unknown[]) => mocks.useItemInteraction(...args),
}));
vi.mock('@/shared/contexts/ProjectContext', () => ({
  useProjectSelectionContext: (...args: unknown[]) => mocks.useProjectSelectionContext(...args),
}));
vi.mock('@/shared/hooks/shots/useShotNavigation', () => ({
  useShotNavigation: (...args: unknown[]) => mocks.useShotNavigation(...args),
}));
vi.mock('@/shared/hooks/shots/useLastAffectedShot', () => ({
  useLastAffectedShot: (...args: unknown[]) => mocks.useLastAffectedShot(...args),
}));
vi.mock('@/shared/hooks/useQuickShotCreate', () => ({
  useQuickShotCreate: (...args: unknown[]) => mocks.useQuickShotCreate(...args),
}));
vi.mock('@/shared/hooks/tasks/useTaskPrefetch', () => ({
  useTaskFromUnifiedCache: (...args: unknown[]) => mocks.useTaskFromUnifiedCache(...args),
  usePrefetchTaskData: (...args: unknown[]) => mocks.usePrefetchTaskData(...args),
}));
vi.mock('@/shared/hooks/tasks/useTaskType', () => ({
  useTaskType: (...args: unknown[]) => mocks.useTaskType(...args),
}));
vi.mock('@/shared/hooks/tasks/useTasks', () => ({
  useGetTask: (...args: unknown[]) => mocks.useGetTask(...args),
}));
vi.mock('@/shared/hooks/useShareGeneration', () => ({
  useShareGeneration: (...args: unknown[]) => mocks.useShareGeneration(...args),
}));
vi.mock('@/shared/hooks/variants/useMarkVariantViewed', () => ({
  useMarkVariantViewed: (...args: unknown[]) => mocks.useMarkVariantViewed(...args),
}));
vi.mock('./MediaGalleryItem/lib/aspectRatioPaddingHelper', () => ({
  resolveAspectRatioPadding: (...args: unknown[]) => mocks.resolveAspectRatioPadding(...args),
}));
vi.mock('@/shared/lib/dnd/dragDrop', () => ({
  setGenerationDragData: (...args: unknown[]) => mocks.setGenerationDragData(...args),
  createDragPreview: (...args: unknown[]) => mocks.createDragPreview(...args),
}));
vi.mock('./MediaGallery/utils', () => ({
  deriveGalleryInputImages: (...args: unknown[]) => mocks.deriveGalleryInputImages(...args),
}));
vi.mock('@/shared/lib/taskParamsUtils', () => ({
  isImageEditTaskType: (...args: unknown[]) => mocks.isImageEditTaskType(...args),
}));
vi.mock('@/shared/lib/media/mediaTypeHelpers', () => ({
  getGenerationId: (...args: unknown[]) => mocks.getGenerationId(...args),
}));

function buildProps(overrides: Record<string, unknown> = {}) {
  return {
    image: {
      id: 'img-1',
      url: 'https://cdn/image.png',
      thumbUrl: 'https://cdn/thumb.png',
      metadata: {},
      createdAt: '2026-01-01T00:00:00.000Z',
    },
    index: 0,
    shotWorkflow: {
      selectedShotIdLocal: 'shot-1',
      simplifiedShotOptions: [{ id: 'shot-1', name: 'Shot 1' }],
      setSelectedShotIdLocal: vi.fn(),
      setLastAffectedShotId: vi.fn(),
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
      currentViewingShotId: 'shot-1',
      onCreateShot: vi.fn(),
      onAddToLastShot: vi.fn(),
      onAddToLastShotWithoutPosition: vi.fn(),
    },
    mobileInteraction: {
      isMobile: false,
      mobileActiveImageId: null,
      mobilePopoverOpenImageId: null,
      onMobileTap: vi.fn(),
    },
    features: {
      showDelete: true,
      showDownload: true,
      showShare: true,
      showEdit: true,
      showStar: true,
      showAddToShot: true,
      enableSingleClick: false,
      videosAsThumbnails: false,
    },
    actions: {
      onOpenLightbox: vi.fn(),
      onDelete: vi.fn(),
      onToggleStar: vi.fn(),
      onImageClick: vi.fn(),
      onImageLoaded: vi.fn(),
    },
    loading: {
      shouldLoad: true,
      isPriority: false,
      isDeleting: false,
    },
    projectAspectRatio: '16:9',
    ...overrides,
  };
}

describe('MediaGalleryItem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useMediaGalleryItemState.mockReturnValue({
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
    });
    mocks.useStableMediaUrls.mockReturnValue({
      isVideoContent: false,
      displayUrl: 'https://cdn/image.png',
      stableDisplayUrl: 'https://cdn/image.png',
      stableVideoUrl: null,
      progressiveEnabled: false,
      isThumbShowing: false,
      isFullLoaded: true,
      progressiveRef: { current: null },
    });
    mocks.useImageLoading.mockReturnValue({
      actualSrc: 'https://cdn/image.png',
      actualDisplayUrl: 'https://cdn/image.png',
      imageLoaded: true,
      imageLoadError: false,
      handleImageLoad: vi.fn(),
      handleImageError: vi.fn(),
      retryImageLoad: vi.fn(),
      setImageLoading: vi.fn(),
    });
    mocks.useMediaGalleryItemShotActions.mockReturnValue({
      addToShot: vi.fn(),
      addToShotWithoutPosition: vi.fn(),
    });
    mocks.useShotPositionChecks.mockReturnValue({
      isAlreadyPositionedInSelectedShot: false,
      isAlreadyAssociatedWithoutPosition: false,
      shouldShowAddWithoutPositionButton: true,
    });
    mocks.useItemInteraction.mockReturnValue({
      handleTouchStart: vi.fn(),
      handleInteraction: vi.fn(),
    });
    mocks.useProjectSelectionContext.mockReturnValue({ selectedProjectId: 'project-1' });
    mocks.useTaskFromUnifiedCache.mockReturnValue({ data: null });
    mocks.usePrefetchTaskData.mockReturnValue(vi.fn());
    mocks.useGetTask.mockReturnValue({ data: null });
    mocks.useTaskType.mockReturnValue({ data: null });
    mocks.useShareGeneration.mockReturnValue({
      handleShare: vi.fn(),
      isCreatingShare: false,
      shareCopied: false,
      shareSlug: null,
    });
    mocks.useMarkVariantViewed.mockReturnValue({ markAllViewed: vi.fn() });
    mocks.useShotNavigation.mockReturnValue({ navigateToShot: vi.fn() });
    mocks.useLastAffectedShot.mockReturnValue({ setLastAffectedShotId: vi.fn() });
    mocks.useQuickShotCreate.mockReturnValue({
      quickCreateSuccess: false,
      handleQuickCreateAndAdd: vi.fn(),
      handleQuickCreateSuccess: vi.fn(),
    });
    mocks.resolveAspectRatioPadding.mockReturnValue('56.25%');
    mocks.deriveGalleryInputImages.mockReturnValue([]);
    mocks.isImageEditTaskType.mockReturnValue(false);
    mocks.getGenerationId.mockImplementation((image: { id?: string }) => image.id ?? null);
    mocks.createDragPreview.mockReturnValue(undefined);
  });

  it('renders placeholder skeleton branch when image id is missing and display url is placeholder', () => {
    mocks.useImageLoading.mockReturnValue({
      actualSrc: '/placeholder.svg',
      actualDisplayUrl: '/placeholder.svg',
      imageLoaded: false,
      imageLoadError: false,
      handleImageLoad: vi.fn(),
      handleImageError: vi.fn(),
      retryImageLoad: vi.fn(),
      setImageLoading: vi.fn(),
    });

    render(
      <MediaGalleryItem
        {...(buildProps({
          image: {
            id: '',
            url: '/placeholder.svg',
            thumbUrl: '/placeholder.svg',
            metadata: {},
            createdAt: '2026-01-01T00:00:00.000Z',
          },
        }) as never)}
      />,
    );

    expect(screen.getByTestId('icon-eye')).toBeInTheDocument();
    expect(screen.queryByTestId('draggable')).not.toBeInTheDocument();
  });

  it('renders desktop draggable branch with image content and create-shot modal support', () => {
    const props = buildProps({
      shotWorkflow: {
        ...buildProps().shotWorkflow,
        onCreateShot: vi.fn(),
      },
    });

    render(<MediaGalleryItem {...(props as never)} />);

    expect(screen.getByTestId('draggable')).toBeInTheDocument();
    expect(screen.getByTestId('image-content')).toBeInTheDocument();
    expect(screen.getByTestId('item-shot-badges')).toBeInTheDocument();
    expect(screen.getByTestId('shot-actions')).toBeInTheDocument();
    expect(screen.getByTestId('item-metadata-bar')).toBeInTheDocument();
    expect(screen.getByTestId('action-buttons')).toBeInTheDocument();
    expect(screen.getByTestId('timestamp')).toBeInTheDocument();
    expect(screen.getByTestId('create-shot-modal')).toBeInTheDocument();

    fireEvent.mouseEnter(screen.getByTestId('draggable').firstElementChild as Element);
    expect(mocks.usePrefetchTaskData.mock.results[0].value).toHaveBeenCalledWith('img-1');
  });
});
