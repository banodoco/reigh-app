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
    selectedShotId,
    shotId,
    onOpenExternalGeneration,
  } = props;
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
    showNavigation = true,
    showTaskDetails = false,
    allShots,
    selectedShotId,
    onShotChange,
    onCreateShot,
    onAddToShot,
    onAddToShotWithoutPosition,
    onDelete,
    onApplySettings,
    isDeleting,
    onNavigateToShot,
    showTickForImageId,
    showTickForSecondaryImageId,
    onShowTick,
    onShowSecondaryTick,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
    adjacentSegments,
    segmentSlotMode,
  } = props;

  const fallbackMedia = media || ({} as GenerationRow);

  const lightboxStateValue = useLightboxStateValue({
    onClose,
    readOnly,
    isMobile: env.isMobile,
    isTabletOrLarger: sharedState.layout.isTabletOrLarger,
    selectedProjectId: env.selectedProjectId,
    actualGenerationId: env.actualGenerationId,
    media: fallbackMedia,
    isVideo: true,
    effectiveMediaUrl: sharedState.effectiveMedia.mediaUrl ?? '',
    effectiveVideoUrl: sharedState.effectiveMedia.videoUrl ?? '',
    effectiveImageDimensions: sharedState.effectiveMedia.imageDimensions,
    imageDimensions: env.imageDimensions,
    setImageDimensions: env.setImageDimensions,
    variants: sharedState.variants.list,
    activeVariant: sharedState.variants.activeVariant,
    primaryVariant: sharedState.variants.primaryVariant,
    isLoadingVariants: sharedState.variants.isLoading,
    setActiveVariantId: sharedState.variants.setActiveVariantId,
    setPrimaryVariant: sharedState.variants.setPrimaryVariant,
    deleteVariant: sharedState.variants.deleteVariant,
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
    showNavigation,
    hasNext: modeModel.hasNext,
    hasPrevious: modeModel.hasPrevious,
    handleSlotNavNext: modeModel.handleSlotNavNext,
    handleSlotNavPrev: modeModel.handleSlotNavPrev,
    swipeNavigation: sharedState.navigation.swipeNavigation,
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
    if (onDelete && media) {
      onDelete(media.id);
    }
  };

  const handleApplySettings = () => {
    if (onApplySettings && media) {
      onApplySettings(media.metadata);
    }
  };

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
      allShots: allShots || [],
      selectedShotId,
      onShotChange,
      onCreateShot,
      onAddToShot,
      onAddToShotWithoutPosition,
      isAlreadyPositionedInSelectedShot: sharedState.shots.isAlreadyPositionedInSelectedShot,
      isAlreadyAssociatedWithoutPosition: sharedState.shots.isAlreadyAssociatedWithoutPosition,
      showTickForImageId,
      showTickForSecondaryImageId,
      onShowTick,
      onShowSecondaryTick,
      onOptimisticPositioned,
      onOptimisticUnpositioned,
    },
    actions: {
      onDelete,
      onApplySettings,
      handleApplySettings,
      handleDelete,
      isDeleting,
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
