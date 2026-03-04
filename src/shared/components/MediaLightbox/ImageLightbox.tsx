/**
 * ImageLightbox
 *
 * Specialized lightbox for image media. Handles all image-specific functionality:
 * - Upscale
 * - Inpainting/magic edit
 * - Reposition mode
 * - Img2Img mode
 *
 * Uses useSharedLightboxState for shared functionality (variants, navigation, etc.)
 * Uses useImageEditOrchestrator for all edit-mode hooks and context value construction.
 *
 * This is part of the split architecture where MediaLightbox dispatches to
 * ImageLightbox or VideoLightbox based on media type.
 */

import React, { useMemo, useEffect, useCallback } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import type { OverlayViewportConstraints } from '@/features/layout/contracts/overlayViewportConstraints';
import type {
  AdjacentSegmentsData,
  TaskDetailsData,
  LightboxNavigationProps,
  LightboxShotWorkflowProps,
  LightboxFeatureFlags,
  LightboxActionHandlers,
} from './types';

import {
  useImageLightboxEnvironment,
  type ImageLightboxEnvironment,
} from './hooks/useImageLightboxEnvironment';
import {
  useImageLightboxSharedState,
  type ImageLightboxSharedModel,
} from './hooks/useImageLightboxSharedState';
import {
  useImageLightboxEditing,
  type ImageLightboxEditModel,
} from './hooks/useImageLightboxEditing';
import { useImageLightboxControlsPanel } from './hooks/useImageLightboxControlsPanel';

import { LightboxShell, LightboxProviders } from './components';
import { LightboxLayout } from './components/layouts/LightboxLayout';
import { ImageEditProvider } from './contexts/ImageEditContext';
import type { WorkflowControlsBarProps } from './components/WorkflowControlsBar';
import type { LightboxLayoutProps } from './components/layouts/types';

import { handleLightboxDownload } from './utils';
import { invokeLightboxDelete } from './utils';

// Re-export grouped sub-interfaces for consumers that import from ImageLightbox
export type {
  LightboxNavigationProps,
  LightboxShotWorkflowProps,
  LightboxFeatureFlags,
  LightboxActionHandlers,
} from './types';

// ============================================================================
// Main Props Interface
// ============================================================================

interface ImageLightboxCoreProps {
  media: GenerationRow;
  onClose: () => void;
  readOnly?: boolean;
  shotId?: string;
  initialVariantId?: string;
  toolTypeOverride?: string;
}

interface ImageLightboxTaskDetailProps {
  taskDetailsData?: TaskDetailsData;
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  onNavigateToGeneration?: (generationId: string) => void;
  adjacentSegments?: AdjacentSegmentsData;
}

interface ImageLightboxUiStateProps {
  showTickForImageId?: string | null;
  showTickForSecondaryImageId?: string | null;
  tasksPaneOpen?: boolean;
  tasksPaneWidth?: number;
}

interface ImageLightboxBehaviorProps {
  // Grouped props
  navigation?: LightboxNavigationProps;
  shotWorkflow?: LightboxShotWorkflowProps;
  features?: LightboxFeatureFlags;
  actions?: LightboxActionHandlers;
}

interface ImageLightboxProps
  extends ImageLightboxCoreProps,
    ImageLightboxTaskDetailProps,
    ImageLightboxUiStateProps,
    ImageLightboxBehaviorProps {}

function useImageLightboxRenderModel(
  props: ImageLightboxProps,
  env: ImageLightboxEnvironment,
  sharedModel: ImageLightboxSharedModel,
  editModel: ImageLightboxEditModel,
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

  const { sharedState, handleSlotNavNext, handleSlotNavPrev } = sharedModel;
  const { editOrchestrator, adjustedTaskDetailsData, variantBadges } = editModel;

  const lightboxVariants = useMemo(() => ({
    variants: sharedState.variants.list,
    activeVariant: sharedState.variants.activeVariant,
    primaryVariant: sharedState.variants.primaryVariant,
    isLoadingVariants: sharedState.variants.isLoading,
    handleVariantSelect: sharedState.variants.setActiveVariantId,
    handleMakePrimary: sharedState.variants.setPrimaryVariant,
    handleDeleteVariant: sharedState.variants.deleteVariant,
    onLoadVariantSettings: env.setVariantParamsToLoad,
    promoteSuccess: sharedState.variants.promoteSuccess,
    isPromoting: sharedState.variants.isPromoting,
    handlePromoteToGeneration: sharedState.variants.handlePromoteToGeneration,
    isMakingMainVariant: sharedState.makeMainVariant.isMaking,
    canMakeMainVariant: sharedState.makeMainVariant.canMake,
    handleMakeMainVariant: sharedState.makeMainVariant.handle,
    pendingTaskCount: variantBadges.pendingTaskCount,
    unviewedVariantCount: variantBadges.unviewedVariantCount,
    onMarkAllViewed: variantBadges.handleMarkAllViewed,
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
    sharedState.variants.promoteSuccess,
    sharedState.variants.isPromoting,
    sharedState.variants.handlePromoteToGeneration,
    sharedState.makeMainVariant.isMaking,
    sharedState.makeMainVariant.canMake,
    sharedState.makeMainVariant.handle,
    variantBadges.pendingTaskCount,
    variantBadges.unviewedVariantCount,
    variantBadges.handleMarkAllViewed,
    env.variantsSectionRef,
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
      isVideo: false,
      effectiveMediaUrl: sharedState.effectiveMedia.mediaUrl ?? '',
      effectiveVideoUrl: '',
      effectiveImageDimensions: sharedState.effectiveMedia.imageDimensions,
      imageDimensions: env.imageDimensions,
      setImageDimensions: env.setImageDimensions,
    },
    variants: lightboxVariants,
    navigation: {
      showNavigation: navigation?.showNavigation ?? true,
      hasNext: navigation?.hasNext ?? false,
      hasPrevious: navigation?.hasPrevious ?? false,
      handleSlotNavNext,
      handleSlotNavPrev,
      swipeNavigation: sharedState.navigation.swipeNavigation,
    },
  }), [
    onClose,
    readOnly,
    env.isMobile,
    sharedState.layout.isTabletOrLarger,
    env.selectedProjectId,
    env.actualGenerationId,
    media,
    sharedState.effectiveMedia.mediaUrl,
    sharedState.effectiveMedia.imageDimensions,
    env.imageDimensions,
    env.setImageDimensions,
    lightboxVariants,
    navigation?.showNavigation,
    navigation?.hasNext,
    navigation?.hasPrevious,
    handleSlotNavNext,
    handleSlotNavPrev,
    sharedState.navigation.swipeNavigation,
  ]);

  const handleDownload = useCallback(() => {
    return handleLightboxDownload({
      intendedVariantId: sharedState.intendedActiveVariantIdRef.current,
      variants: sharedState.variants.list,
      fallbackUrl: sharedState.effectiveMedia.mediaUrl ?? '',
      media,
      isVideo: false,
      setIsDownloading: env.setIsDownloading,
    });
  }, [
    sharedState.intendedActiveVariantIdRef,
    sharedState.variants.list,
    sharedState.effectiveMedia.mediaUrl,
    media,
    env.setIsDownloading,
  ]);

  const handleDelete = useCallback(async (): Promise<void> => {
    if (!actions?.onDelete) {
      return;
    }
    await invokeLightboxDelete(actions.onDelete, media.id, 'ImageLightbox.delete');
  }, [actions?.onDelete, media.id]);

  const onApplySettings = actions?.onApplySettings;
  const handleApplySettings = useCallback(() => {
    onApplySettings?.(media.metadata);
  }, [onApplySettings, media.metadata]);

  const onNavigateToShot = shotWorkflow?.onNavigateToShot;
  const handleNavigateToShotFromSelector = useCallback((shot: { id: string; name: string }) => {
    if (!onNavigateToShot) return;
    const minimalShot = { id: shot.id, name: shot.name, images: [], position: 0 };
    onClose();
    onNavigateToShot(minimalShot);
  }, [onClose, onNavigateToShot]);

  const showTaskDetails = features?.showTaskDetails ?? false;

  const needsFullscreenLayout = true;
  const needsTasksPaneOffset = needsFullscreenLayout
    && (env.effectiveTasksPaneOpen || env.isTasksPaneLocked)
    && !sharedState.layout.isPortraitMode
    && sharedState.layout.isTabletOrLarger;

  const accessibilityTitle = `Image Lightbox - ${media?.id?.substring(0, 8)}`;
  const accessibilityDescription = 'View and interact with image in full screen. Use arrow keys to navigate, Escape to close.';

  const showPanel = sharedState.layout.shouldShowSidePanel
    || ((showTaskDetails || editOrchestrator.isSpecialEditMode) && env.isMobile);

  const panelVariant = (sharedState.layout.shouldShowSidePanel && !env.isMobile) ? 'desktop' as const : 'mobile' as const;
  const panelTaskId = adjustedTaskDetailsData?.taskId
    || media?.source_task_id
    || null;

  const controlsPanelContent = useImageLightboxControlsPanel(
    props,
    env,
    sharedModel,
    editModel,
    showPanel,
    panelVariant,
    panelTaskId,
  );
  const allShots = useMemo(() => shotWorkflow?.allShots ?? [], [shotWorkflow?.allShots]);
  const selectedShotId = shotWorkflow?.selectedShotId;
  const workflowBar = useMemo(() => ({
    core: {
      onDelete: actions?.onDelete,
      onApplySettings: actions?.onApplySettings,
      isSpecialEditMode: editOrchestrator.isSpecialEditMode,
      isVideo: false,
      handleApplySettings,
    },
    shotSelector: shotWorkflow?.onAddToShot
      ? {
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
          onAddToShot: shotWorkflow.onAddToShot,
          onAddToShotWithoutPosition: shotWorkflow?.onAddToShotWithoutPosition,
          onAddVariantAsNewGeneration: sharedState.variants.handleAddVariantAsNewGenerationToShot,
          activeVariantId: sharedState.variants.activeVariant?.id || sharedState.variants.primaryVariant?.id,
          currentTimelineFrame: media.timeline_frame ?? undefined,
          onShowTick: shotWorkflow?.onShowTick,
          onOptimisticPositioned: shotWorkflow?.onOptimisticPositioned,
          onShowSecondaryTick: shotWorkflow?.onShowSecondaryTick,
          onOptimisticUnpositioned: shotWorkflow?.onOptimisticUnpositioned,
          isAdding: false,
          isAddingWithoutPosition: false,
          contentRef: env.contentRef,
          onNavigateToShot: handleNavigateToShotFromSelector,
          onClose,
        }
      : undefined,
  } satisfies WorkflowControlsBarProps), [
    actions?.onDelete,
    actions?.onApplySettings,
    editOrchestrator.isSpecialEditMode,
    handleApplySettings,
    shotWorkflow?.onAddToShot,
    env.actualGenerationId,
    env.contentRef,
    media.id,
    media.thumbUrl,
    media.timeline_frame,
    sharedState.effectiveMedia.mediaUrl,
    allShots,
    selectedShotId,
    shotWorkflow?.onShotChange,
    shotWorkflow?.onCreateShot,
    sharedState.shots.isAlreadyPositionedInSelectedShot,
    sharedState.shots.isAlreadyAssociatedWithoutPosition,
    showTickForImageId,
    showTickForSecondaryImageId,
    shotWorkflow?.onAddToShotWithoutPosition,
    shotWorkflow?.onShowTick,
    shotWorkflow?.onOptimisticPositioned,
    shotWorkflow?.onShowSecondaryTick,
    shotWorkflow?.onOptimisticUnpositioned,
    handleNavigateToShotFromSelector,
    onClose,
    sharedState.variants.handleAddVariantAsNewGenerationToShot,
    sharedState.variants.activeVariant?.id,
    sharedState.variants.primaryVariant?.id,
  ]);

  const layoutProps = useMemo(() => ({
    showPanel,
    shouldShowSidePanel: sharedState.layout.shouldShowSidePanel,
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
    segmentSlotMode: undefined,
  } satisfies LightboxLayoutProps), [
    showPanel,
    sharedState.layout.shouldShowSidePanel,
    env.effectiveTasksPaneOpen,
    env.effectiveTasksPaneWidth,
    workflowBar,
    sharedState.buttonGroupProps.bottomLeft,
    sharedState.buttonGroupProps.bottomRight,
    sharedState.buttonGroupProps.topRight,
    handleDownload,
    handleDelete,
    adjacentSegments,
  ]);

  return {
    lightboxStateValue,
    layoutProps,
    controlsPanelContent,
    needsFullscreenLayout,
    needsTasksPaneOffset,
    accessibilityTitle,
    accessibilityDescription,
  };
}

export const ImageLightbox: React.FC<ImageLightboxProps> = (props) => {
  const env = useImageLightboxEnvironment(props);
  const sharedModel = useImageLightboxSharedState(props, env);
  const editModel = useImageLightboxEditing(props, env, sharedModel);
  const renderModel = useImageLightboxRenderModel(props, env, sharedModel, editModel);
  const overlayViewport: OverlayViewportConstraints = {
    tasksPaneOpen: env.effectiveTasksPaneOpen,
    tasksPaneWidth: env.effectiveTasksPaneWidth,
    tasksPaneLocked: env.isTasksPaneLocked,
    isTabletOrLarger: sharedModel.sharedState.layout.isTabletOrLarger,
    needsFullscreenLayout: renderModel.needsFullscreenLayout,
    needsTasksPaneOffset: renderModel.needsTasksPaneOffset,
  };

  return (
    <LightboxProviders stateValue={renderModel.lightboxStateValue}>
      <ImageEditProvider value={editModel.editOrchestrator.imageEditValue}>
        <LightboxShell
          onClose={props.onClose}
          hasCanvasOverlay={editModel.editOrchestrator.isInpaintMode}
          isRepositionMode={editModel.editOrchestrator.isInpaintMode && editModel.editOrchestrator.editMode === 'reposition'}
          isMobile={env.isMobile}
          overlayViewport={overlayViewport}
          contentRef={env.contentRef}
          accessibilityTitle={renderModel.accessibilityTitle}
          accessibilityDescription={renderModel.accessibilityDescription}
        >
          <LightboxLayout {...renderModel.layoutProps} controlsPanelContent={renderModel.controlsPanelContent} />
        </LightboxShell>
      </ImageEditProvider>
    </LightboxProviders>
  );
};
