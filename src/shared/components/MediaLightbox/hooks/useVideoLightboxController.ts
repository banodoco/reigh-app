import { useMemo } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import { useLoadVariantImages } from '@/shared/hooks/useLoadVariantImages';
import type { SegmentSlotModeData } from '../types';
import {
  useAdjustedTaskDetails,
  useLightboxVariantBadges,
  useLightboxVideoMode,
  usePanelModeRestore,
  useSharedLightboxState,
  useVideoEditContextValue,
  useVideoRegenerateMode,
} from './index';
import type { VideoLightboxEnvironment, VideoLightboxModeModel } from './useVideoLightboxEnvironment';
import type { VideoLightboxProps } from '../videoLightboxContracts';

type SharedLightboxInput = Parameters<typeof useSharedLightboxState>[0];

function buildVideoSharedLightboxInput(params: {
  props: VideoLightboxProps;
  modeModel: VideoLightboxModeModel;
  env: VideoLightboxEnvironment;
}): SharedLightboxInput {
  const { props, modeModel, env } = params;
  const nav = props.navigation;
  const sw = props.shotWorkflow;
  const feat = props.features;
  const act = props.actions;
  const readOnly = props.readOnly ?? false;
  const fallbackMedia = props.media || ({} as GenerationRow);

  return {
    core: {
      media: fallbackMedia,
      isVideo: true,
      selectedProjectId: env.selectedProjectId,
      isMobile: env.isMobile,
      isFormOnlyMode: modeModel.isFormOnlyMode,
      onClose: props.onClose,
      readOnly,
      variantFetchGenerationId: env.variantFetchGenerationId,
      initialVariantId: props.initialVariantId,
    },
    navigation: {
      showNavigation: nav?.showNavigation ?? true,
      hasNext: modeModel.hasNext,
      hasPrevious: modeModel.hasPrevious,
      handleSlotNavNext: modeModel.handleSlotNavNext,
      handleSlotNavPrev: modeModel.handleSlotNavPrev,
      swipeDisabled: env.videoEditSubMode !== null || readOnly,
    },
    shots: {
      shotId: props.shotId,
      selectedShotId: sw?.selectedShotId,
      allShots: sw?.allShots,
      onShotChange: sw?.onShotChange,
      onAddToShot: sw?.onAddToShot,
      onAddToShotWithoutPosition: sw?.onAddToShotWithoutPosition,
      onNavigateToShot: sw?.onNavigateToShot,
      onShowTick: sw?.onShowTick,
      onShowSecondaryTick: sw?.onShowSecondaryTick,
      onOptimisticPositioned: sw?.onOptimisticPositioned,
      onOptimisticUnpositioned: sw?.onOptimisticUnpositioned,
      optimisticPositionedIds: sw?.optimisticPositionedIds,
      optimisticUnpositionedIds: sw?.optimisticUnpositionedIds,
      positionedInSelectedShot: sw?.positionedInSelectedShot,
      associatedWithoutPositionInSelectedShot: sw?.associatedWithoutPositionInSelectedShot,
    },
    layout: {
      showTaskDetails: feat?.showTaskDetails ?? false,
      isSpecialEditMode: env.videoEditSubMode !== null,
      isInpaintMode: false,
      isMagicEditMode: false,
    },
    actions: {
      isCloudMode: env.isCloudMode,
      showDownload: feat?.showDownload ?? true,
      isDownloading: env.isDownloading,
      setIsDownloading: env.setIsDownloading,
      onDelete: act?.onDelete,
      isDeleting: act?.isDeleting,
      isUpscaling: false,
      handleUpscale: () => {},
    },
    media: {
      effectiveImageUrl: env.effectiveImageUrl,
      imageDimensions: env.imageDimensions || { width: 1024, height: 576 },
      projectAspectRatio: env.projectAspectRatio,
    },
    starred: act?.starred,
    onOpenExternalGeneration: props.onOpenExternalGeneration,
  };
}

export function useVideoLightboxSharedState(
  props: VideoLightboxProps,
  modeModel: VideoLightboxModeModel,
  env: VideoLightboxEnvironment,
) {
  const input = buildVideoSharedLightboxInput({ props, modeModel, env });
  return useSharedLightboxState(input);
}

function buildVariantSegmentImages(
  segmentSlotMode?: SegmentSlotModeData,
  currentSegmentImages?: NonNullable<VideoLightboxProps['videoProps']>['currentSegmentImages'],
) {
  if (segmentSlotMode?.pairData) {
    return {
      startUrl: segmentSlotMode.pairData.startImage?.url,
      endUrl: segmentSlotMode.pairData.endImage?.url,
      startGenerationId: segmentSlotMode.pairData.startImage?.generationId,
      endGenerationId: segmentSlotMode.pairData.endImage?.generationId,
      startShotGenerationId: segmentSlotMode.pairData.startImage?.id,
      endShotGenerationId: segmentSlotMode.pairData.endImage?.id,
      startVariantId: segmentSlotMode.pairData.startImage?.primaryVariantId,
      endVariantId: segmentSlotMode.pairData.endImage?.primaryVariantId,
    };
  }

  return currentSegmentImages;
}

export function useVideoLightboxEditing(
  props: VideoLightboxProps,
  modeModel: VideoLightboxModeModel,
  env: VideoLightboxEnvironment,
  sharedState: ReturnType<typeof useVideoLightboxSharedState>,
) {
  const {
    media,
    taskDetailsData,
    initialVariantId,
    shotId,
    segmentSlotMode,
  } = props;

  const currentSegmentImages = props.videoProps?.currentSegmentImages;
  const onSegmentFrameCountChange = props.videoProps?.onSegmentFrameCountChange;
  const currentFrameCount = props.videoProps?.currentFrameCount;
  const onTrimModeChange = props.videoProps?.onTrimModeChange;
  const initialVideoTrimMode = props.videoProps?.initialVideoTrimMode;

  const fallbackMedia = media || ({} as GenerationRow);

  const { adjustedTaskDetailsData } = useAdjustedTaskDetails({
    projectId: env.selectedProjectId ?? null,
    activeVariant: sharedState.variants.activeVariant,
    taskDetailsData,
    isLoadingVariants: sharedState.variants.isLoading,
    initialVariantId,
  });

  const { canRegenerate, regenerateFormProps } = useVideoRegenerateMode({
    isVideo: true,
    media: fallbackMedia,
    shotId,
    selectedProjectId: env.selectedProjectId,
    actualGenerationId: env.actualGenerationId,
    adjustedTaskDetailsData,
    primaryVariant: sharedState.variants.primaryVariant,
    currentSegmentImages,
    segmentSlotMode,
    variantParamsToLoad: env.variantParamsToLoad,
    setVariantParamsToLoad: env.setVariantParamsToLoad,
    onSegmentFrameCountChange: segmentSlotMode?.onFrameCountChange ?? onSegmentFrameCountChange,
    currentFrameCount,
  });

  const videoMode = useLightboxVideoMode({
    media: fallbackMedia,
    isVideo: true,
    selectedProjectId: env.selectedProjectId,
    projectAspectRatio: env.projectAspectRatio,
    shotId,
    actualGenerationId: env.actualGenerationId,
    effectiveVideoUrl: sharedState.effectiveMedia.videoUrl ?? env.effectiveImageUrl,
    activeVariant: sharedState.variants.activeVariant,
    setActiveVariantId: sharedState.variants.setActiveVariantId,
    refetchVariants: sharedState.variants.refetch,
    videoEditSubMode: env.videoEditSubMode,
    setVideoEditSubMode: env.setVideoEditSubMode,
    persistedVideoEditSubMode: env.persistedVideoEditSubMode,
    setPersistedPanelMode: env.setPersistedPanelMode,
    enhanceSettings: env.enhanceSettings,
    setEnhanceSettings: env.setEnhanceSettings,
    onTrimModeChange,
    canRegenerate,
  });

  usePanelModeRestore({
    mediaId: media?.id || '',
    persistedPanelMode: env.persistedPanelMode,
    isVideo: true,
    isSpecialEditMode: false,
    isInVideoEditMode: videoMode.isInVideoEditMode,
    initialVideoTrimMode,
    initialEditActive: false,
    handleEnterVideoEditMode: videoMode.handleEnterVideoEditMode,
  });

  const videoEditValue = useVideoEditContextValue({
    videoEditSubMode: env.videoEditSubMode,
    setVideoEditSubMode: env.setVideoEditSubMode,
    videoMode,
    isFormOnlyMode: modeModel.isFormOnlyMode,
    variantParamsToLoad: env.variantParamsToLoad,
    setVariantParamsToLoad: env.setVariantParamsToLoad,
    setEnhanceSettings: env.setEnhanceSettings,
  });

  const variantBadges = useLightboxVariantBadges({
    pendingTaskGenerationId: regenerateFormProps?.pairShotGenerationId || env.actualGenerationId,
    selectedProjectId: env.selectedProjectId,
    variants: sharedState.variants.list,
    variantFetchGenerationId: env.variantFetchGenerationId,
  });

  const variantSegmentImages = useMemo(() => {
    return buildVariantSegmentImages(segmentSlotMode, currentSegmentImages);
  }, [segmentSlotMode, currentSegmentImages]);

  const { loadVariantImages } = useLoadVariantImages({
    currentSegmentImages: variantSegmentImages,
  });

  return {
    adjustedTaskDetailsData,
    regenerateFormProps,
    videoMode,
    videoEditValue,
    variantBadges,
    variantSegmentImages,
    loadVariantImages,
  };
}

export type VideoLightboxSharedStateModel = ReturnType<typeof useVideoLightboxSharedState>;
export type VideoLightboxEditModel = ReturnType<typeof useVideoLightboxEditing>;
