import { useCallback, useMemo } from 'react';
import type { GenerationRow } from '@/types/shots';
import { VideoEditPanel } from '../components/VideoEditPanel';
import { InfoPanel } from '../components/InfoPanel';
import { useLightboxStateValue } from './useLightboxStateValue';
import { useLightboxWorkflowProps } from './useLightboxWorkflowProps';
import { handleLightboxDownload } from '../utils';
import type {
  VideoLightboxProps,
  VideoLightboxSharedStateModel,
  VideoLightboxEditModel,
} from '../VideoLightbox';
import type { VideoLightboxEnvironment, VideoLightboxModeModel } from './useVideoLightboxEnvironment';

function useVideoLightboxControlsPanel(
  props: VideoLightboxProps,
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
  const setActiveVariantId = sharedState.variants.setActiveVariantId;
  const handleSwitchToPrimary = useCallback(() => {
    if (!primaryVariant) {
      return;
    }
    setActiveVariantId(primaryVariant.id);
  }, [primaryVariant, setActiveVariantId]);

  return useMemo(() => {
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
        currentMediaId={media?.id || ''}
        currentShotId={selectedShotId || shotId}
        replaceImages={env.replaceImages}
        onReplaceImagesChange={env.setReplaceImages}
        onSwitchToPrimary={primaryVariant ? handleSwitchToPrimary : undefined}
        taskId={panelTaskId}
      />
    );
  }, [
    showPanel,
    editModel.videoMode.isInVideoEditMode,
    env.videoEditSubMode,
    panelVariant,
    env.isCloudMode,
    editModel.videoMode.trimState,
    editModel.videoMode.setStartTrim,
    editModel.videoMode.setEndTrim,
    editModel.videoMode.resetTrim,
    editModel.videoMode.trimmedDuration,
    editModel.videoMode.hasTrimChanges,
    editModel.videoMode.saveTrimmedVideo,
    editModel.videoMode.isSavingTrim,
    editModel.videoMode.trimSaveProgress,
    editModel.videoMode.trimSaveError,
    editModel.videoMode.trimSaveSuccess,
    sharedState.effectiveMedia.videoUrl,
    editModel.videoMode.trimCurrentTime,
    editModel.videoMode.trimVideoRef,
    editModel.videoMode.videoEditing,
    env.selectedProjectId,
    editModel.regenerateFormProps,
    editModel.videoMode.videoEnhance.settings,
    editModel.videoMode.videoEnhance.updateSetting,
    editModel.videoMode.videoEnhance.handleGenerate,
    editModel.videoMode.videoEnhance.isGenerating,
    editModel.videoMode.videoEnhance.generateSuccess,
    editModel.videoMode.videoEnhance.canSubmit,
    panelTaskId,
    editModel.adjustedTaskDetailsData,
    sharedState.lineage.derivedItems,
    sharedState.lineage.derivedGenerations,
    sharedState.lineage.paginatedDerived,
    sharedState.lineage.derivedPage,
    sharedState.lineage.derivedTotalPages,
    sharedState.lineage.setDerivedPage,
    onOpenExternalGeneration,
    media?.id,
    selectedShotId,
    shotId,
    env.replaceImages,
    env.setReplaceImages,
    primaryVariant,
    handleSwitchToPrimary,
  ]);
}

export function useVideoLightboxRenderModel(
  props: VideoLightboxProps,
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
    segmentSlotMode,
  } = props;

  const navigation = props.navigation;
  const shotWorkflow = props.shotWorkflow;
  const features = props.features;
  const actions = props.actions;

  const showNavigation = navigation?.showNavigation ?? true;
  const showTaskDetails = features?.showTaskDetails ?? false;

  const mediaForState = useMemo<GenerationRow>(() => {
    if (media) {
      return media;
    }

    // Segment form-only mode can render without a video generation.
    // Provide a minimal, explicit placeholder rather than asserting an empty object.
    return { id: '__segment-form-only__' };
  }, [media]);

  const lightboxCore = useMemo(() => ({
    onClose,
    readOnly,
    isMobile: env.isMobile,
    isTabletOrLarger: sharedState.layout.isTabletOrLarger,
    selectedProjectId: env.selectedProjectId,
    actualGenerationId: env.actualGenerationId,
  }), [
    onClose,
    readOnly,
    env.isMobile,
    sharedState.layout.isTabletOrLarger,
    env.selectedProjectId,
    env.actualGenerationId,
  ]);

  const lightboxMedia = useMemo(() => ({
    media: mediaForState,
    isVideo: true,
    effectiveMediaUrl: sharedState.effectiveMedia.mediaUrl ?? '',
    effectiveVideoUrl: sharedState.effectiveMedia.videoUrl ?? '',
    effectiveImageDimensions: sharedState.effectiveMedia.imageDimensions,
    imageDimensions: env.imageDimensions,
    setImageDimensions: env.setImageDimensions,
  }), [
    mediaForState,
    sharedState.effectiveMedia.mediaUrl,
    sharedState.effectiveMedia.videoUrl,
    sharedState.effectiveMedia.imageDimensions,
    env.imageDimensions,
    env.setImageDimensions,
  ]);

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
    sharedState.variants.list,
    sharedState.variants.activeVariant,
    sharedState.variants.primaryVariant,
    sharedState.variants.isLoading,
    sharedState.variants.setActiveVariantId,
    sharedState.variants.setPrimaryVariant,
    sharedState.variants.deleteVariant,
    env.setVariantParamsToLoad,
    editModel.variantSegmentImages,
    editModel.loadVariantImages,
    sharedState.variants.promoteSuccess,
    sharedState.variants.isPromoting,
    sharedState.variants.handlePromoteToGeneration,
    sharedState.makeMainVariant.isMaking,
    sharedState.makeMainVariant.canMake,
    sharedState.makeMainVariant.handle,
    editModel.variantBadges.pendingTaskCount,
    editModel.variantBadges.unviewedVariantCount,
    editModel.variantBadges.handleMarkAllViewed,
    env.variantsSectionRef,
  ]);

  const lightboxNavigation = useMemo(() => ({
    showNavigation,
    hasNext: modeModel.hasNext,
    hasPrevious: modeModel.hasPrevious,
    handleSlotNavNext: modeModel.handleSlotNavNext,
    handleSlotNavPrev: modeModel.handleSlotNavPrev,
    swipeNavigation: sharedState.navigation.swipeNavigation,
  }), [
    showNavigation,
    modeModel.hasNext,
    modeModel.hasPrevious,
    modeModel.handleSlotNavNext,
    modeModel.handleSlotNavPrev,
    sharedState.navigation.swipeNavigation,
  ]);

  const lightboxStateValue = useLightboxStateValue({
    core: lightboxCore,
    media: lightboxMedia,
    variants: lightboxVariants,
    navigation: lightboxNavigation,
  });

  const handleDownload = async (): Promise<void> => {
    if (!media) {
      return;
    }

    await handleLightboxDownload({
      intendedVariantId: sharedState.intendedActiveVariantIdRef.current,
      variants: sharedState.variants.list,
      fallbackUrl: sharedState.effectiveMedia.videoUrl ?? '',
      media,
      isVideo: true,
      setIsDownloading: env.setIsDownloading,
    });
  };

  const handleDelete = () => {
    if (actions?.onDelete && media) {
      actions.onDelete(media.id);
    }
  };

  const handleApplySettings = () => {
    if (actions?.onApplySettings && media) {
      actions.onApplySettings(media.metadata);
    }
  };

  const onNavigateToShot = shotWorkflow?.onNavigateToShot;
  const handleNavigateToShotFromSelector = useCallback((shot: { id: string; name: string }) => {
    if (!onNavigateToShot) {
      return;
    }
    const minimalShot = { id: shot.id, name: shot.name, images: [], position: 0 };
    onClose();
    onNavigateToShot(minimalShot);
  }, [onClose, onNavigateToShot]);

  const isAnyVideoEditMode = editModel.videoMode.isVideoTrimModeActive || editModel.videoMode.isVideoEditModeActive;
  const shouldShowSidePanelWithTrim = sharedState.layout.shouldShowSidePanel
    || ((!sharedState.layout.isPortraitMode && sharedState.layout.isTabletOrLarger) && isAnyVideoEditMode);

  const showPanel = shouldShowSidePanelWithTrim
    || ((showTaskDetails || isAnyVideoEditMode || (modeModel.isSegmentSlotMode && modeModel.hasSegmentVideo)) && env.isMobile);

  const needsFullscreenLayout = env.isMobile
    || modeModel.isFormOnlyMode
    || sharedState.layout.shouldShowSidePanel
    || shouldShowSidePanelWithTrim;

  const needsTasksPaneOffset = needsFullscreenLayout
    && (env.effectiveTasksPaneOpen || env.isTasksPaneLocked)
    && !sharedState.layout.isPortraitMode
    && sharedState.layout.isTabletOrLarger;

  const accessibilityTitle = modeModel.isFormOnlyMode
    ? `Segment ${(segmentSlotMode?.currentIndex ?? 0) + 1} Settings`
    : `Video Lightbox - ${media?.id?.substring(0, 8)}`;

  const accessibilityDescription = modeModel.isFormOnlyMode
    ? 'Configure and generate this video segment. Use Tab or arrow keys to navigate between segments.'
    : 'View and interact with video in full screen. Use arrow keys to navigate, Escape to close.';

  const panelVariant = (shouldShowSidePanelWithTrim && !env.isMobile) ? 'desktop' as const : 'mobile' as const;
  const panelTaskId = editModel.adjustedTaskDetailsData?.taskId
    || media?.source_task_id
    || null;

  const controlsPanelContent = useVideoLightboxControlsPanel(
    props,
    env,
    sharedState,
    editModel,
    showPanel,
    panelVariant,
    panelTaskId,
  );

  const { layoutProps } = useLightboxWorkflowProps({
    panel: {
      showPanel,
      shouldShowSidePanel: shouldShowSidePanelWithTrim,
      effectiveTasksPaneOpen: env.effectiveTasksPaneOpen,
      effectiveTasksPaneWidth: env.effectiveTasksPaneWidth,
    },
    shotWorkflow: {
      allShots: shotWorkflow?.allShots || [],
      selectedShotId: shotWorkflow?.selectedShotId,
      onShotChange: shotWorkflow?.onShotChange,
      onCreateShot: shotWorkflow?.onCreateShot,
      onAddToShot: shotWorkflow?.onAddToShot,
      onAddToShotWithoutPosition: shotWorkflow?.onAddToShotWithoutPosition,
      isAlreadyPositionedInSelectedShot: sharedState.shots.isAlreadyPositionedInSelectedShot,
      isAlreadyAssociatedWithoutPosition: sharedState.shots.isAlreadyAssociatedWithoutPosition,
      showTickForImageId,
      showTickForSecondaryImageId,
      onShowTick: shotWorkflow?.onShowTick,
      onShowSecondaryTick: shotWorkflow?.onShowSecondaryTick,
      onOptimisticPositioned: shotWorkflow?.onOptimisticPositioned,
      onOptimisticUnpositioned: shotWorkflow?.onOptimisticUnpositioned,
    },
    actions: {
      onDelete: actions?.onDelete,
      onApplySettings: actions?.onApplySettings,
      handleApplySettings,
      handleDelete,
      isDeleting: actions?.isDeleting,
      handleNavigateToShotFromSelector,
      handleAddVariantAsNewGenerationToShot: sharedState.variants.handleAddVariantAsNewGenerationToShot,
    },
    buttonGroupProps: {
      ...sharedState.buttonGroupProps,
      topRight: {
        ...sharedState.buttonGroupProps.topRight,
        handleDownload,
        handleDelete,
      },
    },
    contentRef: env.contentRef,
    adjacentSegments,
    segmentSlotMode: modeModel.hasSegmentVideo ? segmentSlotMode : undefined,
  });

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
