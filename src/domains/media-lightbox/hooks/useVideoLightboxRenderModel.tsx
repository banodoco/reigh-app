import { useMemo } from 'react';
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
import {
  buildVideoControlsPanelContent,
  buildVideoEditPanelModel,
  buildVideoLightboxStateValue,
  buildVideoLightboxVariantsModel,
} from './videoLightbox/renderModelBuilders';

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

  const lightboxVariants = useMemo(() => buildVideoLightboxVariantsModel({
    sharedState,
    editModel,
    env,
  }), [editModel, env, sharedState]);

  const lightboxStateValue = useMemo(() => buildVideoLightboxStateValue({
    media,
    onClose,
    readOnly,
    env,
    sharedState,
    modeModel,
    showNavigation,
    lightboxVariants,
  }), [env, lightboxVariants, media, modeModel, onClose, readOnly, sharedState, showNavigation]);

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
  const videoEditPanelModel = useMemo(() => buildVideoEditPanelModel({
    panelVariant,
    env,
    editModel,
    sharedState,
    panelTaskId,
  }), [editModel, env, panelTaskId, panelVariant, sharedState]);
  const videoInfoPanelModel = useVideoInfoPanelModel({
    props,
    panelVariant,
    panelTaskId,
    env,
    sharedState,
    editModel,
  });
  const controlsPanelContent = useMemo(() => buildVideoControlsPanelContent({
    showPanel,
    isInVideoEditMode: editModel.videoMode.isInVideoEditMode,
    videoEditSubMode: env.videoEditSubMode,
    videoEditPanelModel,
    videoInfoPanelModel,
  }), [
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
