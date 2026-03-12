import { isValidElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { InfoPanel } from '../../components/InfoPanel';
import { VideoEditPanel } from '../../components/VideoEditPanel';
import { __internal } from './useVideoLightboxRenderModel';

describe('renderModelBuilders', () => {
  it('builds video lightbox variants and state models from shared seams', () => {
    const handleMarkAllViewed = vi.fn();
    const lightboxVariants = __internal.buildVideoLightboxVariantsModel(
      {
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
        },
        makeMainVariant: {
          isMaking: false,
          canMake: true,
          handle: vi.fn(),
        },
      } as never,
      {
        loadVariantImages: vi.fn(),
        variantBadges: {
          pendingTaskCount: 2,
          unviewedVariantCount: 1,
          handleMarkAllViewed,
        },
        variantSegmentImages: {
          startUrl: 'https://cdn.example.com/start.png',
        },
      } as never,
      {
        setVariantParamsToLoad: vi.fn(),
        variantsSectionRef: { current: null },
      } as never,
    );

    const stateValue = __internal.buildVideoLightboxStateValue(
      {
        media: { id: 'video-1' } as never,
        onClose: vi.fn(),
        readOnly: false,
      },
      {
        actualGenerationId: 'gen-1',
        imageDimensions: { width: 1920, height: 1080 },
        isMobile: false,
        selectedProjectId: 'project-1',
        setImageDimensions: vi.fn(),
      } as never,
      {
        effectiveMedia: {
          mediaUrl: 'https://cdn.example.com/poster.png',
          videoUrl: 'https://cdn.example.com/video.mp4',
          imageDimensions: { width: 1920, height: 1080 },
        },
        layout: {
          isTabletOrLarger: true,
        },
        navigation: {
          swipeNavigation: {
            swipeHandlers: {},
            isSwiping: false,
            swipeOffset: 0,
          },
        },
      } as never,
      {
        hasNext: true,
        hasPrevious: false,
        handleSlotNavNext: vi.fn(),
        handleSlotNavPrev: vi.fn(),
      } as never,
      true,
      lightboxVariants,
    );

    expect(lightboxVariants.onLoadVariantImages).toBeTypeOf('function');
    expect(lightboxVariants.pendingTaskCount).toBe(2);
    expect(lightboxVariants.onMarkAllViewed).toBe(handleMarkAllViewed);
    expect(stateValue.media.effectiveVideoUrl).toBe('https://cdn.example.com/video.mp4');
    expect(stateValue.navigation.hasNext).toBe(true);
    expect(stateValue.variants).toBe(lightboxVariants);
  });

  it('selects the correct controls panel content for the active mode', () => {
    const videoEditPanelModel = __internal.buildVideoEditPanelModel(
      'desktop',
      {
        isCloudMode: true,
        selectedProjectId: 'project-1',
      } as never,
      {
        regenerateFormProps: null,
        videoMode: {
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
            settings: { speed: 1 } as never,
            updateSetting: vi.fn(),
            handleGenerate: vi.fn(),
            isGenerating: false,
            generateSuccess: false,
            canSubmit: true,
          },
        },
      } as never,
      {
        effectiveMedia: {
          videoUrl: 'https://cdn.example.com/video.mp4',
        },
      } as never,
      'task-1',
    );

    const editContent = __internal.buildVideoControlsPanelContent(
      true,
      true,
      'trim',
      videoEditPanelModel,
      {
        variant: 'desktop',
        showImageEditTools: false,
        taskPanel: {
          taskDetailsData: undefined,
          derivedItems: [],
          derivedGenerations: [],
          paginatedDerived: [],
          derivedPage: 1,
          derivedTotalPages: 1,
          onSetDerivedPage: vi.fn(),
          currentMediaId: 'video-1',
          replaceImages: false,
          onReplaceImagesChange: vi.fn(),
        },
      },
    );

    const infoContent = __internal.buildVideoControlsPanelContent(
      true,
      false,
      null,
      videoEditPanelModel,
      {
        variant: 'desktop',
        showImageEditTools: false,
        taskPanel: {
          taskDetailsData: undefined,
          derivedItems: [],
          derivedGenerations: [],
          paginatedDerived: [],
          derivedPage: 1,
          derivedTotalPages: 1,
          onSetDerivedPage: vi.fn(),
          currentMediaId: 'video-1',
          replaceImages: false,
          onReplaceImagesChange: vi.fn(),
        },
      },
    );

    expect(isValidElement(editContent)).toBe(true);
    expect(isValidElement(infoContent)).toBe(true);

    if (isValidElement(editContent) && isValidElement(infoContent)) {
      expect(editContent.type).toBe(VideoEditPanel);
      expect(infoContent.type).toBe(InfoPanel);
    }
  });
});
