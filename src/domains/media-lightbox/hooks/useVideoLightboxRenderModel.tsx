import { useMemo } from 'react';
import { VideoEditPanel } from '../components/VideoEditPanel';
import { InfoPanel } from '../components/InfoPanel';
import type {
  VideoLightboxPropsWithMedia,
} from '../types';
import type {
  VideoLightboxSharedStateModel,
  VideoLightboxEditModel,
} from './useVideoLightboxController';
import type { VideoLightboxEnvironment, VideoLightboxModeModel } from './useVideoLightboxEnvironment';
import { useVideoLightboxActions } from './useVideoLightboxActions';
import { buildVideoLightboxLayoutState } from '../model/buildVideoLightboxLayoutState';
import { useVideoInfoPanelModel } from './useVideoInfoPanelModel';
import { useVideoWorkflowBarModel } from './useVideoWorkflowBarModel';

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

  const lightboxVariants = useMemo(() => ({
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
  }), [
    editModel.loadVariantImages,
    editModel.variantBadges.handleMarkAllViewed,
    editModel.variantBadges.pendingTaskCount,
    editModel.variantBadges.unviewedVariantCount,
    editModel.variantSegmentImages,
    env.setVariantParamsToLoad,
    env.variantsSectionRef,
    sharedState.makeMainVariant.canMake,
    sharedState.makeMainVariant.handle,
    sharedState.makeMainVariant.isMaking,
    sharedState.variants.activeVariant,
    sharedState.variants.deleteVariant,
    sharedState.variants.handlePromoteToGeneration,
    sharedState.variants.isLoading,
    sharedState.variants.isPromoting,
    sharedState.variants.list,
    sharedState.variants.primaryVariant,
    sharedState.variants.promoteSuccess,
    sharedState.variants.setActiveVariantId,
    sharedState.variants.setPrimaryVariant,
  ]);

  const lightboxStateValue = useMemo(() => ({
    core: {
      onClose,
      readOnly,
      isMobile: env.isMobile,
      isTabletOrLarger: sharedState.layout.isTabletOrLarger,
      selectedProjectId: env.selectedProjectId,
      actualGenerationId: env.actualGenerationId,
    },
    media: {
      media,
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
  }), [
    env.actualGenerationId,
    env.imageDimensions,
    env.isMobile,
    env.selectedProjectId,
    env.setImageDimensions,
    lightboxVariants,
    media,
    modeModel.handleSlotNavNext,
    modeModel.handleSlotNavPrev,
    modeModel.hasNext,
    modeModel.hasPrevious,
    onClose,
    readOnly,
    sharedState.effectiveMedia.imageDimensions,
    sharedState.effectiveMedia.mediaUrl,
    sharedState.effectiveMedia.videoUrl,
    sharedState.layout.isTabletOrLarger,
    sharedState.navigation.swipeNavigation,
    showNavigation,
  ]);

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
  const videoEditPanelModel = useMemo(() => ({
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
  }), [
    editModel.regenerateFormProps,
    editModel.videoMode.hasTrimChanges,
    editModel.videoMode.isSavingTrim,
    editModel.videoMode.resetTrim,
    editModel.videoMode.saveTrimmedVideo,
    editModel.videoMode.setEndTrim,
    editModel.videoMode.setStartTrim,
    editModel.videoMode.trimCurrentTime,
    editModel.videoMode.trimSaveError,
    editModel.videoMode.trimSaveProgress,
    editModel.videoMode.trimSaveSuccess,
    editModel.videoMode.trimState,
    editModel.videoMode.trimVideoRef,
    editModel.videoMode.trimmedDuration,
    editModel.videoMode.videoEditing,
    editModel.videoMode.videoEnhance.canSubmit,
    editModel.videoMode.videoEnhance.generateSuccess,
    editModel.videoMode.videoEnhance.handleGenerate,
    editModel.videoMode.videoEnhance.isGenerating,
    editModel.videoMode.videoEnhance.settings,
    editModel.videoMode.videoEnhance.updateSetting,
    env.isCloudMode,
    env.selectedProjectId,
    panelTaskId,
    panelVariant,
    sharedState.effectiveMedia.videoUrl,
  ]);
  const videoInfoPanelModel = useVideoInfoPanelModel({
    props,
    panelVariant,
    panelTaskId,
    env,
    sharedState,
    editModel,
  });
  const controlsPanelContent = useMemo(() => {
    if (!showPanel) {
      return undefined;
    }

    if (editModel.videoMode.isInVideoEditMode && env.videoEditSubMode) {
      return <VideoEditPanel {...videoEditPanelModel} />;
    }

    return <InfoPanel {...videoInfoPanelModel} />;
  }, [
    editModel.videoMode.isInVideoEditMode,
    env.videoEditSubMode,
    showPanel,
    videoEditPanelModel,
    videoInfoPanelModel,
  ]);
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
