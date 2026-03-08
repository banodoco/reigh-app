import { describe, expect, it, vi } from 'vitest';
import {
  buildLightboxLayoutProps,
  buildLightboxStateValue,
  buildLightboxVariantState,
} from './lightboxRenderBuilders';

describe('lightboxRenderBuilders', () => {
  it('builds shared variant state with optional segment image handlers', () => {
    const result = buildLightboxVariantState({
      sharedVariants: {
        list: [],
        activeVariant: null,
        primaryVariant: null,
        isLoading: false,
        setActiveVariantId: vi.fn(),
        setPrimaryVariant: vi.fn().mockResolvedValue(undefined),
        deleteVariant: vi.fn().mockResolvedValue(undefined),
        promoteSuccess: false,
        isPromoting: false,
        handlePromoteToGeneration: vi.fn().mockResolvedValue(undefined),
      },
      makeMainVariant: {
        isMaking: false,
        canMake: true,
        handle: vi.fn().mockResolvedValue(undefined),
      },
      onLoadVariantSettings: vi.fn(),
      pendingTaskCount: 2,
      unviewedVariantCount: 3,
      onMarkAllViewed: vi.fn(),
      variantsSectionRef: null,
    });

    expect(result.pendingTaskCount).toBe(2);
    expect(result.unviewedVariantCount).toBe(3);
    expect(result.canMakeMainVariant).toBe(true);
    expect(result.onLoadVariantImages).toBeUndefined();
  });

  it('builds lightbox state payload', () => {
    const onClose = vi.fn();
    const setImageDimensions = vi.fn();
    const state = buildLightboxStateValue({
      onClose,
      readOnly: true,
      isMobile: false,
      isTabletOrLarger: true,
      selectedProjectId: 'p1',
      actualGenerationId: 'g1',
      media: { id: 'media-1' } as never,
      isVideo: true,
      effectiveMediaUrl: 'https://example.com/image.jpg',
      effectiveVideoUrl: 'https://example.com/video.mp4',
      effectiveImageDimensions: { width: 100, height: 50 },
      imageDimensions: { width: 100, height: 50 },
      setImageDimensions,
      variants: buildLightboxVariantState({
        sharedVariants: {
          list: [],
          activeVariant: null,
          primaryVariant: null,
          isLoading: false,
          setActiveVariantId: vi.fn(),
          setPrimaryVariant: vi.fn().mockResolvedValue(undefined),
          deleteVariant: vi.fn().mockResolvedValue(undefined),
          promoteSuccess: false,
          isPromoting: false,
          handlePromoteToGeneration: vi.fn().mockResolvedValue(undefined),
        },
        makeMainVariant: {
          isMaking: false,
          canMake: false,
          handle: vi.fn().mockResolvedValue(undefined),
        },
        pendingTaskCount: 0,
        unviewedVariantCount: 0,
        onMarkAllViewed: vi.fn(),
        variantsSectionRef: null,
      }),
      showNavigation: true,
      hasNext: true,
      hasPrevious: false,
      handleSlotNavNext: vi.fn(),
      handleSlotNavPrev: vi.fn(),
      swipeNavigation: {
        swipeHandlers: {},
        isSwiping: false,
        swipeOffset: 0,
      },
    });

    expect(state.core.onClose).toBe(onClose);
    expect(state.media.isVideo).toBe(true);
    expect(state.navigation.hasNext).toBe(true);
  });

  it('builds layout props and injects download/delete handlers into top-right controls', () => {
    const handleDownload = vi.fn().mockResolvedValue(undefined);
    const handleDelete = vi.fn().mockResolvedValue(undefined);
    const layout = buildLightboxLayoutProps({
      showPanel: true,
      shouldShowSidePanel: false,
      effectiveTasksPaneOpen: true,
      effectiveTasksPaneWidth: 360,
      workflowBar: { core: { isVideo: false } } as never,
      buttonGroups: {
        topRight: {
          showDownload: true,
          isDownloading: false,
          onClose: vi.fn(),
        },
        bottomLeft: {
          isUpscaling: false,
          handleUpscale: vi.fn().mockResolvedValue(undefined),
          localStarred: false,
          handleToggleStar: vi.fn(),
          toggleStarPending: false,
        },
        bottomRight: {
          isAddingToReferences: false,
          addToReferencesSuccess: false,
          handleAddToReferences: vi.fn().mockResolvedValue(undefined),
        },
      },
      handleDownload,
      handleDelete,
    });

    expect(layout.buttonGroups.topRight.handleDownload).toBe(handleDownload);
    expect(layout.buttonGroups.topRight.handleDelete).toBe(handleDelete);
    expect(layout.effectiveTasksPaneWidth).toBe(360);
  });
});
