import { useMemo } from 'react';
import { useLoadVariantImages } from '@/shared/hooks/variants/useLoadVariantImages';
import { useAdjustedTaskDetails } from './useAdjustedTaskDetails';
import { useLightboxVariantBadges } from './useLightboxVariantBadges';
import { useLightboxVideoMode } from './useLightboxVideoMode';
import {
  buildVariantSegmentImages,
  buildVideoSharedLightboxInput,
} from './lightboxSharedBuilders';
import { usePanelModeRestore } from './usePanelModeRestore';
import { useSharedLightboxState } from './useSharedLightboxState';
import { useVideoEditContextValue } from './useVideoEditContextValue';
import { useVideoRegenerateMode } from './useVideoRegenerateMode';
import type { VideoLightboxEnvironment, VideoLightboxModeModel } from './useVideoLightboxEnvironment';
import type { VideoLightboxPropsWithMedia } from '../types';

export function useVideoLightboxSharedState(
  props: VideoLightboxPropsWithMedia,
  modeModel: VideoLightboxModeModel,
  env: VideoLightboxEnvironment,
) {
  const input = buildVideoSharedLightboxInput({ props, modeModel, env });
  return useSharedLightboxState(input);
}

export function useVideoLightboxEditing(
  props: VideoLightboxPropsWithMedia,
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

  const { adjustedTaskDetailsData } = useAdjustedTaskDetails({
    projectId: env.selectedProjectId ?? null,
    activeVariant: sharedState.variants.activeVariant,
    taskDetailsData,
    isLoadingVariants: sharedState.variants.isLoading,
    initialVariantId,
  });

  const { canRegenerate, regenerateFormProps } = useVideoRegenerateMode({
    isVideo: true,
    media,
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
    core: {
      media,
      isVideo: true,
      selectedProjectId: env.selectedProjectId,
      projectAspectRatio: env.projectAspectRatio,
      shotId,
      actualGenerationId: env.actualGenerationId,
      effectiveVideoUrl: sharedState.effectiveMedia.videoUrl ?? env.effectiveImageUrl,
    },
    variants: {
      activeVariant: sharedState.variants.activeVariant,
      setActiveVariantId: sharedState.variants.setActiveVariantId,
      refetchVariants: sharedState.variants.refetch,
    },
    editState: {
      videoEditSubMode: env.videoEditSubMode,
      setVideoEditSubMode: env.setVideoEditSubMode,
      persistedVideoEditSubMode: env.persistedVideoEditSubMode,
      setPersistedPanelMode: env.setPersistedPanelMode,
    },
    enhance: {
      settings: env.enhanceSettings,
      setSettings: env.setEnhanceSettings,
      canRegenerate,
    },
    onTrimModeChange,
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
