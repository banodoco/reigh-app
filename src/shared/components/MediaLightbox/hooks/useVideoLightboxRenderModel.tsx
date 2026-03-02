import { useMemo } from 'react';
import { VideoEditPanel } from '../components/VideoEditPanel';
import { InfoPanel } from '../components/InfoPanel';
import type {
  VideoLightboxPropsWithMedia,
} from '../videoLightboxContracts';
import type {
  VideoLightboxSharedStateModel,
  VideoLightboxEditModel,
} from './useVideoLightboxController';
import type { VideoLightboxEnvironment, VideoLightboxModeModel } from './useVideoLightboxEnvironment';
import { useVideoLightboxActions } from './useVideoLightboxActions';
import { buildVideoLightboxLayoutState } from './useVideoLightboxLayoutState';

function buildVideoLightboxControlsPanel(
  props: VideoLightboxPropsWithMedia,
  env: VideoLightboxEnvironment,
  sharedState: VideoLightboxSharedStateModel,
  editModel: VideoLightboxEditModel,
  showPanel: boolean,
  panelVariant: 'desktop' | 'mobile',
  panelTaskId: string | null,
) {
  const {
    media,
    shotId,
    onOpenExternalGeneration,
  } = props;
  const selectedShotId = props.shotWorkflow?.selectedShotId;
  const primaryVariant = sharedState.variants.primaryVariant;
  const handleSwitchToPrimary = primaryVariant
    ? () => {
      sharedState.variants.setActiveVariantId(primaryVariant.id);
    }
    : undefined;

  if (!showPanel) {
    return undefined;
  }

  if (editModel.videoMode.isInVideoEditMode && env.videoEditSubMode) {
    return (
      <VideoEditPanel
        variant={panelVariant}
        isCloudMode={env.isCloudMode}
        trimState={editModel.videoMode.trimState}
        onStartTrimChange={editModel.videoMode.setStartTrim}
        onEndTrimChange={editModel.videoMode.setEndTrim}
        onResetTrim={editModel.videoMode.resetTrim}
        trimmedDuration={editModel.videoMode.trimmedDuration}
        hasTrimChanges={editModel.videoMode.hasTrimChanges}
        onSaveTrim={editModel.videoMode.saveTrimmedVideo}
        isSavingTrim={editModel.videoMode.isSavingTrim}
        trimSaveProgress={editModel.videoMode.trimSaveProgress}
        trimSaveError={editModel.videoMode.trimSaveError}
        trimSaveSuccess={editModel.videoMode.trimSaveSuccess}
        videoUrl={sharedState.effectiveMedia.videoUrl ?? ''}
        trimCurrentTime={editModel.videoMode.trimCurrentTime}
        trimVideoRef={editModel.videoMode.trimVideoRef}
        videoEditing={editModel.videoMode.videoEditing}
        projectId={env.selectedProjectId ?? undefined}
        regenerateFormProps={editModel.regenerateFormProps}
        enhanceSettings={editModel.videoMode.videoEnhance.settings}
        onUpdateEnhanceSetting={editModel.videoMode.videoEnhance.updateSetting}
        onEnhanceGenerate={editModel.videoMode.videoEnhance.handleGenerate}
        isEnhancing={editModel.videoMode.videoEnhance.isGenerating}
        enhanceSuccess={editModel.videoMode.videoEnhance.generateSuccess}
        canEnhance={editModel.videoMode.videoEnhance.canSubmit}
        taskId={panelTaskId}
      />
    );
  }

  return (
    <InfoPanel
      variant={panelVariant}
      showImageEditTools={false}
      taskDetailsData={editModel.adjustedTaskDetailsData}
      derivedItems={sharedState.lineage.derivedItems}
      derivedGenerations={sharedState.lineage.derivedGenerations}
      paginatedDerived={sharedState.lineage.paginatedDerived}
      derivedPage={sharedState.lineage.derivedPage}
      derivedTotalPages={sharedState.lineage.derivedTotalPages}
      onSetDerivedPage={sharedState.lineage.setDerivedPage}
      onNavigateToGeneration={onOpenExternalGeneration}
      currentMediaId={media.id}
      currentShotId={selectedShotId || shotId}
      replaceImages={env.replaceImages}
      onReplaceImagesChange={env.setReplaceImages}
      onSwitchToPrimary={handleSwitchToPrimary}
      taskId={panelTaskId}
    />
  );
}

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
    showTickForImageId,
    showTickForSecondaryImageId,
    adjacentSegments,
  } = props;

  const navigation = props.navigation;
  const shotWorkflow = props.shotWorkflow;
  const features = props.features;
  const actions = props.actions;

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

  const controlsPanelContent = buildVideoLightboxControlsPanel(
    props,
    env,
    sharedState,
    editModel,
    showPanel,
    panelVariant,
    panelTaskId,
  );
  const allShots = useMemo(() => shotWorkflow?.allShots ?? [], [shotWorkflow?.allShots]);
  const selectedShotId = shotWorkflow?.selectedShotId;
  const workflowBar = useMemo(() => ({
    onAddToShot: shotWorkflow?.onAddToShot,
    onDelete: actions?.onDelete,
    onApplySettings: actions?.onApplySettings,
    isSpecialEditMode: false,
    isVideo: true,
    mediaId: env.actualGenerationId ?? media.id,
    imageUrl: sharedState.effectiveMedia.mediaUrl ?? '',
    thumbUrl: media.thumbUrl,
    allShots,
    selectedShotId,
    onShotChange: shotWorkflow?.onShotChange,
    onCreateShot: shotWorkflow?.onCreateShot,
    isAlreadyPositionedInSelectedShot: sharedState.shots.isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition: sharedState.shots.isAlreadyAssociatedWithoutPosition,
    showTickForImageId,
    showTickForSecondaryImageId,
    onAddToShotWithoutPosition: shotWorkflow?.onAddToShotWithoutPosition,
    onShowTick: shotWorkflow?.onShowTick,
    onOptimisticPositioned: shotWorkflow?.onOptimisticPositioned,
    onShowSecondaryTick: shotWorkflow?.onShowSecondaryTick,
    onOptimisticUnpositioned: shotWorkflow?.onOptimisticUnpositioned,
    contentRef: env.contentRef,
    handleApplySettings,
    onNavigateToShot: handleNavigateToShotFromSelector,
    onClose,
    onAddVariantAsNewGeneration: sharedState.variants.handleAddVariantAsNewGenerationToShot,
    activeVariantId: sharedState.variants.activeVariant?.id || sharedState.variants.primaryVariant?.id,
    currentTimelineFrame: media.timeline_frame ?? undefined,
  }), [
    actions?.onApplySettings,
    actions?.onDelete,
    allShots,
    editModel.variantBadges,
    env.actualGenerationId,
    env.contentRef,
    handleApplySettings,
    handleNavigateToShotFromSelector,
    media.id,
    media.thumbUrl,
    media.timeline_frame,
    onClose,
    selectedShotId,
    sharedState.effectiveMedia.mediaUrl,
    sharedState.shots.isAlreadyAssociatedWithoutPosition,
    sharedState.shots.isAlreadyPositionedInSelectedShot,
    sharedState.variants.activeVariant?.id,
    sharedState.variants.handleAddVariantAsNewGenerationToShot,
    sharedState.variants.primaryVariant?.id,
    shotWorkflow?.onAddToShot,
    shotWorkflow?.onAddToShotWithoutPosition,
    shotWorkflow?.onCreateShot,
    shotWorkflow?.onOptimisticPositioned,
    shotWorkflow?.onOptimisticUnpositioned,
    shotWorkflow?.onShotChange,
    shotWorkflow?.onShowSecondaryTick,
    shotWorkflow?.onShowTick,
    showTickForImageId,
    showTickForSecondaryImageId,
  ]);

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
