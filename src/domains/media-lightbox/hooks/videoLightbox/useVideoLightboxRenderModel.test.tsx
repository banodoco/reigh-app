// @vitest-environment jsdom

import { isValidElement, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useVideoLightboxRenderModel } from './useVideoLightboxRenderModel';
import { RuntimeAuthorityContext } from '@/app/runtime/runtimeAuthority';

const routerWrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
};

const runtimeRouterWrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <RuntimeAuthorityContext.Provider value={{
          runtimeAuthority: true,
          runtimeProjectId: 'runtime-project',
        }}>
          {children}
        </RuntimeAuthorityContext.Provider>
      </QueryClientProvider>
    </MemoryRouter>
  );
};

const mocks = vi.hoisted(() => ({
  handleDownload: vi.fn(),
  handleDelete: vi.fn(),
  handleApplySettings: vi.fn(),
  handleNavigateToShotFromSelector: vi.fn(),
  buildVideoLightboxLayoutState: vi.fn(),
  MockInfoPanel: vi.fn(() => null),
  MockVideoEditPanel: vi.fn(() => null),
}));

vi.mock('./useVideoLightboxActions', () => ({
  useVideoLightboxActions: () => ({
    handleDownload: mocks.handleDownload,
    handleDelete: mocks.handleDelete,
    handleApplySettings: mocks.handleApplySettings,
    handleNavigateToShotFromSelector: mocks.handleNavigateToShotFromSelector,
  }),
}));

vi.mock('../../model/buildVideoLightboxLayoutState', () => ({
  buildVideoLightboxLayoutState: (...args: unknown[]) => mocks.buildVideoLightboxLayoutState(...args),
}));

vi.mock('../../components/InfoPanel', () => ({
  InfoPanel: mocks.MockInfoPanel,
}));

vi.mock('../../components/VideoEditPanel', () => ({
  VideoEditPanel: mocks.MockVideoEditPanel,
}));

function createProps(overrides: Record<string, unknown> = {}) {
  return {
    media: { id: 'video-123456789', source_task_id: 'task-1', thumbUrl: 'thumb.jpg', timeline_frame: 0 },
    onClose: vi.fn(),
    readOnly: false,
    adjacentSegments: undefined,
    shotId: 'shot-1',
    onOpenExternalGeneration: vi.fn(),
    showTickForImageId: undefined,
    showTickForSecondaryImageId: undefined,
    actions: undefined,
    shotWorkflow: undefined,
    navigation: { showNavigation: true },
    features: { showTaskDetails: false },
    ...overrides,
  } as never;
}

function createModeModel(overrides: Record<string, unknown> = {}) {
  return {
    isSegmentSlotMode: false,
    hasSegmentVideo: false,
    isFormOnlyMode: false,
    hasNext: true,
    hasPrevious: false,
    handleSlotNavNext: vi.fn(),
    handleSlotNavPrev: vi.fn(),
    ...overrides,
  } as never;
}

function createEnv(overrides: Record<string, unknown> = {}) {
  return {
    isMobile: false,
    isCloudMode: true,
    selectedProjectId: 'project-1',
    actualGenerationId: 'gen-1',
    imageDimensions: { width: 1920, height: 1080 },
    setImageDimensions: vi.fn(),
    setVariantParamsToLoad: vi.fn(),
    variantsSectionRef: { current: null },
    effectiveTasksPaneOpen: false,
    effectiveTasksPaneWidth: 300,
    isTasksPaneLocked: false,
    videoEditSubMode: null,
    contentRef: { current: null },
    replaceImages: false,
    setReplaceImages: vi.fn(),
    ...overrides,
  } as never;
}

function createSharedState(overrides: Record<string, unknown> = {}) {
  return {
    variants: {
      list: [{ id: 'variant-1' }],
      activeVariant: { id: 'variant-1' },
      primaryVariant: { id: 'variant-1' },
      isLoading: false,
      setActiveVariantId: vi.fn(),
      setPrimaryVariant: vi.fn(),
      deleteVariant: vi.fn(),
      promoteSuccess: false,
      isPromoting: false,
      handlePromoteToGeneration: vi.fn(),
      handleAddVariantAsNewGenerationToShot: vi.fn(),
    },
    makeMainVariant: {
      isMaking: false,
      canMake: true,
      handle: vi.fn(),
    },
    effectiveMedia: {
      mediaUrl: 'https://cdn.example.com/poster.png',
      videoUrl: 'https://cdn.example.com/video.mp4',
      imageDimensions: { width: 1920, height: 1080 },
    },
    layout: {
      isTabletOrLarger: true,
      isPortraitMode: false,
      shouldShowSidePanel: true,
    },
    navigation: {
      swipeNavigation: { swipeHandlers: {}, isSwiping: false, swipeOffset: 0 },
    },
    lineage: {
      derivedItems: [],
      derivedGenerations: [],
      paginatedDerived: [],
      derivedPage: 1,
      derivedTotalPages: 1,
      setDerivedPage: vi.fn(),
    },
    buttonGroupProps: {
      bottomLeft: {},
      bottomRight: {},
      topRight: {},
    },
    shots: {
      isAlreadyPositionedInSelectedShot: false,
      isAlreadyAssociatedWithoutPosition: false,
    },
    ...overrides,
  } as never;
}

function createEditModel(overrides: Record<string, unknown> = {}) {
  return {
    variantBadges: {
      pendingTaskCount: 3,
      unviewedVariantCount: 1,
      handleMarkAllViewed: vi.fn(),
    },
    variantSegmentImages: { startUrl: 'https://cdn.example.com/start.png' },
    loadVariantImages: vi.fn(),
    adjustedTaskDetailsData: undefined,
    regenerateFormProps: null,
    videoMode: {
      isVideoTrimModeActive: false,
      isVideoEditModeActive: false,
      isInVideoEditMode: false,
      trimState: { startTrim: 0, endTrim: 0, videoDuration: 10 },
      setStartTrim: vi.fn(),
      setEndTrim: vi.fn(),
      resetTrim: vi.fn(),
      trimmedDuration: 10,
      hasTrimChanges: false,
      saveTrimmedVideo: vi.fn(),
      isSavingTrim: false,
      trimSaveProgress: 0,
      trimSaveError: null,
      trimSaveSuccess: false,
      trimCurrentTime: 0,
      trimVideoRef: { current: null },
      videoEditing: {},
      videoEnhance: {
        settings: {},
        updateSetting: vi.fn(),
        handleGenerate: vi.fn(),
        isGenerating: false,
        generateSuccess: false,
        canSubmit: true,
      },
    },
    ...overrides,
  } as never;
}

describe('useVideoLightboxRenderModel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildVideoLightboxLayoutState.mockReturnValue({
      shouldShowSidePanelWithTrim: true,
      showPanel: true,
      needsFullscreenLayout: false,
      needsTasksPaneOffset: false,
      panelVariant: 'desktop' as const,
    });
  });

  it('maps pendingTaskCount from editModel.variantBadges', () => {
    const editModel = createEditModel();
    const { result } = renderHook(() =>
      useVideoLightboxRenderModel(
        createProps(),
        createModeModel(),
        createEnv(),
        createSharedState(),
        editModel,
      ),
     { wrapper: routerWrapper });

    expect(result.current.lightboxStateValue.variants.pendingTaskCount).toBe(3);
  });

  it('wires onMarkAllViewed to editModel.variantBadges.handleMarkAllViewed', () => {
    const handleMarkAllViewed = vi.fn();
    const editModel = createEditModel({
      variantBadges: {
        pendingTaskCount: 0,
        unviewedVariantCount: 2,
        handleMarkAllViewed,
      },
    });
    const { result } = renderHook(() =>
      useVideoLightboxRenderModel(
        createProps(),
        createModeModel(),
        createEnv(),
        createSharedState(),
        editModel,
      ),
     { wrapper: routerWrapper });

    expect(result.current.lightboxStateValue.variants.onMarkAllViewed).toBe(handleMarkAllViewed);
    result.current.lightboxStateValue.variants.onMarkAllViewed();
    expect(handleMarkAllViewed).toHaveBeenCalledOnce();
  });

  it('maps effectiveVideoUrl from sharedState.effectiveMedia.videoUrl', () => {
    const sharedState = createSharedState({
      effectiveMedia: {
        mediaUrl: 'https://cdn.example.com/poster.png',
        videoUrl: 'https://cdn.example.com/specific-video.mp4',
        imageDimensions: { width: 1920, height: 1080 },
      },
    });
    const { result } = renderHook(() =>
      useVideoLightboxRenderModel(
        createProps(),
        createModeModel(),
        createEnv(),
        sharedState,
        createEditModel(),
      ),
     { wrapper: routerWrapper });

    expect(result.current.lightboxStateValue.media.effectiveVideoUrl).toBe(
      'https://cdn.example.com/specific-video.mp4',
    );
  });

  it('hides the unsupported source-image mutation for Runtime documents', () => {
    const { result } = renderHook(() =>
      useVideoLightboxRenderModel(
        createProps(),
        createModeModel(),
        createEnv(),
        createSharedState(),
        createEditModel(),
      ),
      { wrapper: runtimeRouterWrapper },
    );

    expect(result.current.lightboxStateValue.variants.onLoadVariantImages).toBeUndefined();
  });

  it('maps navigation hasNext from modeModel', () => {
    const modeModelWithNext = createModeModel({ hasNext: true, hasPrevious: false });
    const { result } = renderHook(() =>
      useVideoLightboxRenderModel(
        createProps(),
        modeModelWithNext,
        createEnv(),
        createSharedState(),
        createEditModel(),
      ),
     { wrapper: routerWrapper });

    expect(result.current.lightboxStateValue.navigation.hasNext).toBe(true);
    expect(result.current.lightboxStateValue.navigation.hasPrevious).toBe(false);
  });

  it('renders VideoEditPanel when isInVideoEditMode and videoEditSubMode are set', () => {
    const editModel = createEditModel({
      videoMode: {
        ...createEditModel().videoMode,
        isInVideoEditMode: true,
        isVideoTrimModeActive: false,
        isVideoEditModeActive: true,
      },
    });
    const env = createEnv({ videoEditSubMode: 'trim' });

    mocks.buildVideoLightboxLayoutState.mockReturnValue({
      shouldShowSidePanelWithTrim: true,
      showPanel: true,
      needsFullscreenLayout: false,
      needsTasksPaneOffset: false,
      panelVariant: 'desktop',
    });

    const { result } = renderHook(() =>
      useVideoLightboxRenderModel(
        createProps(),
        createModeModel(),
        env,
        createSharedState(),
        editModel,
      ),
     { wrapper: routerWrapper });

    const panel = result.current.controlsPanelContent;
    expect(isValidElement(panel)).toBe(true);
    if (isValidElement(panel)) {
      expect(panel.type).toBe(mocks.MockVideoEditPanel);
    }
  });

  it('renders InfoPanel when not in video edit mode', () => {
    const editModel = createEditModel({
      videoMode: {
        ...createEditModel().videoMode,
        isInVideoEditMode: false,
      },
    });
    const env = createEnv({ videoEditSubMode: null });

    mocks.buildVideoLightboxLayoutState.mockReturnValue({
      shouldShowSidePanelWithTrim: true,
      showPanel: true,
      needsFullscreenLayout: false,
      needsTasksPaneOffset: false,
      panelVariant: 'desktop',
    });

    const { result } = renderHook(() =>
      useVideoLightboxRenderModel(
        createProps(),
        createModeModel(),
        env,
        createSharedState(),
        editModel,
      ),
     { wrapper: routerWrapper });

    const panel = result.current.controlsPanelContent;
    expect(isValidElement(panel)).toBe(true);
    if (isValidElement(panel)) {
      expect(panel.type).toBe(mocks.MockInfoPanel);
    }
  });

  it('returns undefined controlsPanelContent when showPanel is false', () => {
    mocks.buildVideoLightboxLayoutState.mockReturnValue({
      shouldShowSidePanelWithTrim: false,
      showPanel: false,
      needsFullscreenLayout: false,
      needsTasksPaneOffset: false,
      panelVariant: 'desktop',
    });

    const { result } = renderHook(() =>
      useVideoLightboxRenderModel(
        createProps(),
        createModeModel(),
        createEnv(),
        createSharedState(),
        createEditModel(),
      ),
     { wrapper: routerWrapper });

    expect(result.current.controlsPanelContent).toBeUndefined();
  });
});
