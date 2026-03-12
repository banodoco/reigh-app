import type { ComponentProps, ReactNode } from 'react';
import { useMemo } from 'react';
import type {
  VideoLightboxPropsWithMedia,
} from '../../types';
import type {
  VideoLightboxSharedStateModel,
  VideoLightboxEditModel,
} from './useVideoLightboxController';
import type { VideoLightboxEnvironment, VideoLightboxModeModel } from './useVideoLightboxEnvironment';
import { useVideoLightboxActions } from './useVideoLightboxActions';
import { buildVideoLightboxLayoutState } from '../../model/buildVideoLightboxLayoutState';
import { InfoPanel } from '../../components/InfoPanel';
import { VideoEditPanel } from '../../components/VideoEditPanel';
import type { LightboxStateValue } from '../../contexts/LightboxStateContext';
import { useVideoInfoPanelModel } from './useVideoInfoPanelModel';
import { useVideoWorkflowBarModel } from './useVideoWorkflowBarModel';

type VideoEditPanelModel = ComponentProps<typeof VideoEditPanel>;
type VideoInfoPanelModel = ComponentProps<typeof InfoPanel>;

function buildVideoLightboxVariantsModel(
  sharedState: VideoLightboxSharedStateModel,
  editModel: Pick<VideoLightboxEditModel, 'loadVariantImages' | 'variantBadges' | 'variantSegmentImages'>,
  env: Pick<VideoLightboxEnvironment, 'setVariantParamsToLoad' | 'variantsSectionRef'>,
): LightboxStateValue['variants'] {
  return {
    variants: sharedState.variants.list,
    activeVariant: sharedState.variants.activeVariant,
    primaryVariant: sharedState.variants.primaryVariant,
    isLoadingVariants: sharedState.variants.isLoading,
    handleVariantSelect: sharedState.variants.setActiveVariantId,
    handleMakePrimary: sharedState.variants.setPrimaryVariant,
    handleDeleteVariant: sharedState.variants.deleteVariant,
    onLoadVariantSettings: env.setVariantParamsToLoad,
    onLoadVariantImages: editModel.variantSegmentImages ? editModel.loadVariantImages : undefined,
    currentSegmentImages: editModel.variantSegmentImages,
    promoteSuccess: sharedState.variants.promoteSuccess,
    isPromoting: sharedState.variants.isPromoting,
    handlePromoteToGeneration: sharedState.variants.handlePromoteToGeneration,
    isMakingMainVariant: sharedState.makeMainVariant.isMaking,
    canMakeMainVariant: sharedState.makeMainVariant.canMake,
    handleMakeMainVariant: sharedState.makeMainVariant.handle,
    pendingTaskCount: editModel.variantBadges.pendingTaskCount,
    unviewedVariantCount: editModel.variantBadges.unviewedVariantCount,
    onMarkAllViewed: editModel.variantBadges.handleMarkAllViewed,
    variantsSectionRef: env.variantsSectionRef,
  };
}

function buildVideoLightboxStateValue(
  props: Pick<VideoLightboxPropsWithMedia, 'media' | 'onClose' | 'readOnly'>,
  env: Pick<
    VideoLightboxEnvironment,
    'actualGenerationId' | 'imageDimensions' | 'isMobile' | 'selectedProjectId' | 'setImageDimensions'
  >,
  sharedState: Pick<VideoLightboxSharedStateModel, 'effectiveMedia' | 'layout' | 'navigation'>,
  modeModel: Pick<VideoLightboxModeModel, 'handleSlotNavNext' | 'handleSlotNavPrev' | 'hasNext' | 'hasPrevious'>,
  showNavigation: boolean,
  lightboxVariants: LightboxStateValue['variants'],
): LightboxStateValue {
  return {
    core: {
      onClose: props.onClose,
      readOnly: props.readOnly ?? false,
      isMobile: env.isMobile,
      isTabletOrLarger: sharedState.layout.isTabletOrLarger,
      selectedProjectId: env.selectedProjectId,
      actualGenerationId: env.actualGenerationId,
    },
    media: {
      media: props.media,
      isVideo: true,
      effectiveMediaUrl: sharedState.effectiveMedia.mediaUrl ?? '',
      effectiveVideoUrl: sharedState.effectiveMedia.videoUrl ?? '',
      effectiveImageDimensions: sharedState.effectiveMedia.imageDimensions,
      imageDimensions: env.imageDimensions,
      setImageDimensions: env.setImageDimensions,
    },
    variants: lightboxVariants,
    navigation: {
      showNavigation,
      hasNext: modeModel.hasNext,
      hasPrevious: modeModel.hasPrevious,
      handleSlotNavNext: modeModel.handleSlotNavNext,
      handleSlotNavPrev: modeModel.handleSlotNavPrev,
      swipeNavigation: sharedState.navigation.swipeNavigation,
    },
  };
}

function buildVideoEditPanelModel(
  panelVariant: 'desktop' | 'mobile',
  env: Pick<VideoLightboxEnvironment, 'isCloudMode' | 'selectedProjectId'>,
  editModel: Pick<VideoLightboxEditModel, 'regenerateFormProps' | 'videoMode'>,
  sharedState: Pick<VideoLightboxSharedStateModel, 'effectiveMedia'>,
  panelTaskId: string | null,
): VideoEditPanelModel {
  return {
    variant: panelVariant,
    isCloudMode: env.isCloudMode,
    trim: {
      trimState: editModel.videoMode.trimState,
      onStartTrimChange: editModel.videoMode.setStartTrim,
      onEndTrimChange: editModel.videoMode.setEndTrim,
      onResetTrim: editModel.videoMode.resetTrim,
      trimmedDuration: editModel.videoMode.trimmedDuration,
      hasTrimChanges: editModel.videoMode.hasTrimChanges,
      onSaveTrim: editModel.videoMode.saveTrimmedVideo,
      isSavingTrim: editModel.videoMode.isSavingTrim,
      trimSaveProgress: editModel.videoMode.trimSaveProgress,
      trimSaveError: editModel.videoMode.trimSaveError,
      trimSaveSuccess: editModel.videoMode.trimSaveSuccess,
      videoUrl: sharedState.effectiveMedia.videoUrl ?? '',
      trimCurrentTime: editModel.videoMode.trimCurrentTime,
      trimVideoRef: editModel.videoMode.trimVideoRef,
    },
    replace: {
      videoEditing: editModel.videoMode.videoEditing,
      projectId: env.selectedProjectId ?? undefined,
    },
    regenerateFormProps: editModel.regenerateFormProps,
    enhance: {
      settings: editModel.videoMode.videoEnhance.settings,
      onUpdateSetting: editModel.videoMode.videoEnhance.updateSetting,
      onGenerate: editModel.videoMode.videoEnhance.handleGenerate,
      isGenerating: editModel.videoMode.videoEnhance.isGenerating,
      generateSuccess: editModel.videoMode.videoEnhance.generateSuccess,
      canSubmit: editModel.videoMode.videoEnhance.canSubmit,
    },
    taskId: panelTaskId,
  };
}

function buildVideoControlsPanelContent(
  showPanel: boolean,
  isInVideoEditMode: boolean,
  videoEditSubMode: VideoLightboxEnvironment['videoEditSubMode'],
  videoEditPanelModel: VideoEditPanelModel,
  videoInfoPanelModel: VideoInfoPanelModel,
): ReactNode | undefined {
  if (!showPanel) {
    return undefined;
  }

  if (isInVideoEditMode && videoEditSubMode) {
    return <VideoEditPanel {...videoEditPanelModel} />;
  }

  return <InfoPanel {...videoInfoPanelModel} />;
}

export const __internal = {
  buildVideoControlsPanelContent,
  buildVideoEditPanelModel,
  buildVideoLightboxStateValue,
  buildVideoLightboxVariantsModel,
};

function getVideoLightboxAccessibility(
  _modeModel: VideoLightboxModeModel,
  media: VideoLightboxPropsWithMedia['media'],
): { accessibilityTitle: string; accessibilityDescription: string } {
  return {
    accessibilityTitle: `Video Lightbox - ${media.id.substring(0, 8)}`,
    accessibilityDescription: 'View and interact with video in full screen. Use arrow keys to navigate, Escape to close.',
  };
}

export function useVideoLightboxRenderModel(
  props: VideoLightboxPropsWithMedia,
  modeModel: VideoLightboxModeModel,
  env: VideoLightboxEnvironment,
  sharedState: VideoLightboxSharedStateModel,
  editModel: VideoLightboxEditModel,
) {
  const {
    media,
    onClose,
    readOnly = false,
    adjacentSegments,
  } = props;

  const navigation = props.navigation;
  const features = props.features;

  const showNavigation = navigation?.showNavigation ?? true;
  const showTaskDetails = features?.showTaskDetails ?? false;

  const lightboxVariants = useMemo(
    () => buildVideoLightboxVariantsModel(sharedState, editModel, env),
    [editModel, env, sharedState],
  );

  const lightboxStateValue = useMemo(
    () => buildVideoLightboxStateValue({ media, onClose, readOnly }, env, sharedState, modeModel, showNavigation, lightboxVariants),
    [env, lightboxVariants, media, modeModel, onClose, readOnly, sharedState, showNavigation],
  );

  const {
    handleDownload,
    handleDelete,
    handleApplySettings,
    handleNavigateToShotFromSelector,
  } = useVideoLightboxActions({
    props,
    env,
    sharedState,
  });

  const isAnyVideoEditMode = editModel.videoMode.isVideoTrimModeActive || editModel.videoMode.isVideoEditModeActive;
  const layoutFlags = buildVideoLightboxLayoutState({
    isMobile: env.isMobile,
    isFormOnlyMode: modeModel.isFormOnlyMode,
    isTabletOrLarger: sharedState.layout.isTabletOrLarger,
    isPortraitMode: sharedState.layout.isPortraitMode,
    shouldShowSidePanel: sharedState.layout.shouldShowSidePanel,
    isAnyVideoEditMode,
    hasSegmentVideo: modeModel.hasSegmentVideo,
    showTaskDetails,
    isSegmentSlotMode: modeModel.isSegmentSlotMode,
    effectiveTasksPaneOpen: env.effectiveTasksPaneOpen,
    isTasksPaneLocked: env.isTasksPaneLocked,
  });

  const {
    shouldShowSidePanelWithTrim,
    showPanel,
    needsFullscreenLayout,
    needsTasksPaneOffset,
    panelVariant,
  } = layoutFlags;
  const { accessibilityTitle, accessibilityDescription } = getVideoLightboxAccessibility(
    modeModel,
    media,
  );
  const panelTaskId = editModel.adjustedTaskDetailsData?.taskId
    || media.source_task_id
    || null;
  const videoEditPanelModel = useMemo(
    () => buildVideoEditPanelModel(panelVariant, env, editModel, sharedState, panelTaskId),
    [editModel, env, panelTaskId, panelVariant, sharedState],
  );
  const videoInfoPanelModel = useVideoInfoPanelModel({
    props,
    panelVariant,
    panelTaskId,
    env,
    sharedState,
    editModel,
  });
  const controlsPanelContent = useMemo(
    () => buildVideoControlsPanelContent(
      showPanel,
      editModel.videoMode.isInVideoEditMode,
      env.videoEditSubMode,
      videoEditPanelModel,
      videoInfoPanelModel,
    ),
    [
      editModel.videoMode.isInVideoEditMode,
      env.videoEditSubMode,
      showPanel,
      videoEditPanelModel,
      videoInfoPanelModel,
    ],
  );
  const workflowBar = useVideoWorkflowBarModel({
    props,
    env,
    sharedState,
    handleApplySettings,
    handleNavigateToShotFromSelector,
  });

  const layoutProps = useMemo(() => ({
    showPanel,
    shouldShowSidePanel: shouldShowSidePanelWithTrim,
    effectiveTasksPaneOpen: env.effectiveTasksPaneOpen,
    effectiveTasksPaneWidth: env.effectiveTasksPaneWidth,
    workflowBar,
    buttonGroups: {
      bottomLeft: sharedState.buttonGroupProps.bottomLeft,
      bottomRight: sharedState.buttonGroupProps.bottomRight,
      topRight: {
        ...sharedState.buttonGroupProps.topRight,
        handleDownload,
        handleDelete,
      },
    },
    adjacentSegments,
    segmentSlotMode: modeModel.hasSegmentVideo ? props.segmentSlotMode : undefined,
  }), [
    adjacentSegments,
    env.effectiveTasksPaneOpen,
    env.effectiveTasksPaneWidth,
    handleDelete,
    handleDownload,
    modeModel.hasSegmentVideo,
    props.segmentSlotMode,
    sharedState.buttonGroupProps.bottomLeft,
    sharedState.buttonGroupProps.bottomRight,
    sharedState.buttonGroupProps.topRight,
    shouldShowSidePanelWithTrim,
    showPanel,
    workflowBar,
  ]);

  return {
    lightboxStateValue,
    controlsPanelContent,
    layoutProps,
    needsFullscreenLayout,
    needsTasksPaneOffset,
    accessibilityTitle,
    accessibilityDescription,
  };
}
