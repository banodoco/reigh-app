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

import React, { useCallback, useMemo } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import type { OverlayViewportConstraints } from '@/shared/lib/layout/overlayViewportConstraints';
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
import { ImageLightboxControlsPanel } from './components/ImageLightboxControlsPanel';

import { LightboxShell } from './components/LightboxShell';
import { LightboxProviders } from './components/LightboxProviders';
import { LightboxLayout } from './components/layouts/LightboxLayout';
import { ImageEditProvider } from './contexts/ImageEditContext';
import type { WorkflowControlsBarProps } from './components/WorkflowControlsBar';
import {
  buildLightboxLayoutProps,
  buildLightboxStateValue,
  buildLightboxVariantState,
} from './model/lightboxRenderBuilders';

import { handleLightboxDownload } from './utils/lightboxDownload';
import { invokeLightboxDelete } from './utils/lightboxDelete';

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
    adjacentSegments,
    showTickForImageId,
    showTickForSecondaryImageId,
  } = props;

  const navigation = props.navigation;
  const shotWorkflow = props.shotWorkflow;

  const { sharedState, handleSlotNavNext, handleSlotNavPrev } = sharedModel;
  const { editOrchestrator, adjustedTaskDetailsData, variantBadges } = editModel;

  // --- Variant state for LightboxStateContext ---
  const lightboxVariants = useMemo(() => buildLightboxVariantState({
    sharedVariants: sharedState.variants,
    makeMainVariant: sharedState.makeMainVariant,
    onLoadVariantSettings: env.setVariantParamsToLoad,
    pendingTaskCount: variantBadges.pendingTaskCount,
    unviewedVariantCount: variantBadges.unviewedVariantCount,
    onMarkAllViewed: variantBadges.handleMarkAllViewed,
    variantsSectionRef: env.variantsSectionRef,
  }), [
    sharedState.variants, env.setVariantParamsToLoad,
    sharedState.makeMainVariant, variantBadges, env.variantsSectionRef,
  ]);

  // --- Action handlers ---
  const handleDownload = useCallback(() => {
    return handleLightboxDownload({
      intendedVariantId: sharedState.intendedActiveVariantIdRef.current,
      variants: sharedState.variants.list,
      fallbackUrl: sharedState.effectiveMedia.mediaUrl ?? '',
      media, isVideo: false, setIsDownloading: env.setIsDownloading,
    });
  }, [sharedState.intendedActiveVariantIdRef, sharedState.variants.list, sharedState.effectiveMedia.mediaUrl, media, env.setIsDownloading]);

  const handleDelete = useCallback(async (): Promise<void> => {
    if (!props.actions?.onDelete) return;
    await invokeLightboxDelete(props.actions.onDelete, media.id, 'ImageLightbox.delete');
  }, [props.actions?.onDelete, media.id]);

  const handleApplySettings = useCallback(() => {
    props.actions?.onApplySettings?.(media.metadata);
  }, [props.actions?.onApplySettings, media.metadata]);

  // --- Workflow bar ---
  const handleNavigateToShotFromSelector = useCallback((shot: { id: string; name: string }) => {
    if (!shotWorkflow?.onNavigateToShot) return;
    onClose();
    shotWorkflow.onNavigateToShot({ id: shot.id, name: shot.name, images: [], position: 0 });
  }, [onClose, shotWorkflow]);

  const allShots = useMemo(() => shotWorkflow?.allShots ?? [], [shotWorkflow?.allShots]);
  const selectedShotId = shotWorkflow?.selectedShotId;

  const workflowBar = useMemo(() => ({
    core: {
      onDelete: props.actions?.onDelete,
      onApplySettings: props.actions?.onApplySettings,
      isSpecialEditMode: editOrchestrator.isSpecialEditMode,
      isVideo: false,
      handleApplySettings,
    },
    shotSelector: shotWorkflow?.onAddToShot
      ? {
          mediaId: env.actualGenerationId ?? media.id,
          imageUrl: sharedState.effectiveMedia.mediaUrl ?? '',
          thumbUrl: media.thumbUrl,
          allShots, selectedShotId,
          onShotChange: shotWorkflow?.onShotChange,
          onCreateShot: shotWorkflow?.onCreateShot,
          isAlreadyPositionedInSelectedShot: sharedState.shots.isAlreadyPositionedInSelectedShot,
          isAlreadyAssociatedWithoutPosition: sharedState.shots.isAlreadyAssociatedWithoutPosition,
          showTickForImageId, showTickForSecondaryImageId,
          onAddToShot: shotWorkflow.onAddToShot,
          onAddToShotWithoutPosition: shotWorkflow?.onAddToShotWithoutPosition,
          onAddVariantAsNewGeneration: sharedState.variants.handleAddVariantAsNewGenerationToShot,
          activeVariantId: sharedState.variants.activeVariant?.id || sharedState.variants.primaryVariant?.id,
          currentTimelineFrame: media.timeline_frame ?? undefined,
          onShowTick: shotWorkflow?.onShowTick,
          onOptimisticPositioned: shotWorkflow?.onOptimisticPositioned,
          onShowSecondaryTick: shotWorkflow?.onShowSecondaryTick,
          onOptimisticUnpositioned: shotWorkflow?.onOptimisticUnpositioned,
          isAdding: false, isAddingWithoutPosition: false,
          contentRef: env.contentRef,
          onNavigateToShot: handleNavigateToShotFromSelector,
          onClose,
        }
      : undefined,
  } satisfies WorkflowControlsBarProps), [
    props.actions?.onDelete, props.actions?.onApplySettings,
    editOrchestrator.isSpecialEditMode, handleApplySettings,
    shotWorkflow, env.actualGenerationId, env.contentRef,
    media.id, media.thumbUrl, media.timeline_frame,
    sharedState.effectiveMedia.mediaUrl, allShots, selectedShotId,
    sharedState.shots.isAlreadyPositionedInSelectedShot,
    sharedState.shots.isAlreadyAssociatedWithoutPosition,
    showTickForImageId, showTickForSecondaryImageId,
    sharedState.variants.handleAddVariantAsNewGenerationToShot,
    sharedState.variants.activeVariant?.id, sharedState.variants.primaryVariant?.id,
    handleNavigateToShotFromSelector, onClose,
  ]);

  // --- Panel layout ---
  const showTaskDetails = props.features?.showTaskDetails ?? false;
  const showPanel = sharedState.layout.shouldShowSidePanel
    || ((showTaskDetails || editOrchestrator.isSpecialEditMode) && env.isMobile);
  const panelVariant = (sharedState.layout.shouldShowSidePanel && !env.isMobile)
    ? 'desktop' as const : 'mobile' as const;
  const panelTaskId = adjustedTaskDetailsData?.taskId || media?.source_task_id || null;

  const needsFullscreenLayout = true;
  const needsTasksPaneOffset = needsFullscreenLayout
    && (env.effectiveTasksPaneOpen || env.isTasksPaneLocked)
    && !sharedState.layout.isPortraitMode
    && sharedState.layout.isTabletOrLarger;

  // --- Build lightbox state value ---
  const lightboxStateValue = useMemo(() => buildLightboxStateValue({
    onClose,
    readOnly,
    isMobile: env.isMobile,
    isTabletOrLarger: sharedState.layout.isTabletOrLarger,
    selectedProjectId: env.selectedProjectId,
    actualGenerationId: env.actualGenerationId,
    media,
    isVideo: false,
    effectiveMediaUrl: sharedState.effectiveMedia.mediaUrl ?? '',
    effectiveVideoUrl: '',
    effectiveImageDimensions: sharedState.effectiveMedia.imageDimensions,
    imageDimensions: env.imageDimensions,
    setImageDimensions: env.setImageDimensions,
    variants: lightboxVariants,
    showNavigation: navigation?.showNavigation ?? true,
    hasNext: navigation?.hasNext ?? false,
    hasPrevious: navigation?.hasPrevious ?? false,
    handleSlotNavNext,
    handleSlotNavPrev,
    swipeNavigation: sharedState.navigation.swipeNavigation,
  }), [
    onClose, readOnly, env.isMobile, sharedState.layout.isTabletOrLarger,
    env.selectedProjectId, env.actualGenerationId, media,
    sharedState.effectiveMedia.mediaUrl, sharedState.effectiveMedia.imageDimensions,
    env.imageDimensions, env.setImageDimensions, lightboxVariants,
    navigation?.showNavigation, navigation?.hasNext, navigation?.hasPrevious,
    handleSlotNavNext, handleSlotNavPrev, sharedState.navigation.swipeNavigation,
  ]);

  const controlsPanelContent = (
    <ImageLightboxControlsPanel
      media={props.media}
      shotId={props.shotWorkflow?.shotId}
      onOpenExternalGeneration={props.onOpenExternalGeneration}
      shotWorkflow={props.shotWorkflow}
      features={props.features}
      env={env}
      sharedModel={sharedModel}
      editModel={editModel}
      showPanel={showPanel}
      panelVariant={panelVariant}
      panelTaskId={panelTaskId}
    />
  );

  const layoutProps = useMemo(() => buildLightboxLayoutProps({
    showPanel,
    shouldShowSidePanel: sharedState.layout.shouldShowSidePanel,
    effectiveTasksPaneOpen: env.effectiveTasksPaneOpen,
    effectiveTasksPaneWidth: env.effectiveTasksPaneWidth,
    workflowBar,
    buttonGroups: sharedState.buttonGroupProps,
    handleDownload,
    handleDelete,
    adjacentSegments,
  }), [
    showPanel, sharedState.layout.shouldShowSidePanel,
    env.effectiveTasksPaneOpen, env.effectiveTasksPaneWidth, workflowBar,
    sharedState.buttonGroupProps, handleDownload, handleDelete, adjacentSegments,
  ]);

  return {
    lightboxStateValue, layoutProps, controlsPanelContent,
    needsFullscreenLayout, needsTasksPaneOffset,
    accessibilityTitle: `Image Lightbox - ${media?.id?.substring(0, 8)}`,
    accessibilityDescription: 'View and interact with image in full screen. Use arrow keys to navigate, Escape to close.',
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
