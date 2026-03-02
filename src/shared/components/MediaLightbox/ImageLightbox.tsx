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

import React, { useState, useRef, useMemo, useEffect, useCallback, useLayoutEffect } from 'react';
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

import { useProject } from '@/shared/contexts/ProjectContext';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import { useIsMobile } from '@/shared/hooks/mobile';

import {
  useUpscale,
  useEditSettingsPersistence,
  usePanelModeRestore,
  useAdjustedTaskDetails,
  useSharedLightboxState,
  useLightboxVariantBadges,
  useImageEditOrchestrator,
} from './hooks';

import { LightboxShell, LightboxProviders } from './components';
import { LightboxLayout } from './components/layouts/LightboxLayout';
import { EditModePanel } from './components/EditModePanel';
import { InfoPanel } from './components/InfoPanel';
import { ImageEditProvider } from './contexts/ImageEditContext';
import type { WorkflowControlsBarProps } from './components/WorkflowControlsBar';
import type { LightboxLayoutProps } from './components/layouts/types';

import { extractDimensionsFromMedia, handleLightboxDownload } from './utils';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
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

interface ImageLightboxProps {
  media: GenerationRow;
  onClose: () => void;
  readOnly?: boolean;
  shotId?: string;
  initialVariantId?: string;
  toolTypeOverride?: string;
  taskDetailsData?: TaskDetailsData;
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  onNavigateToGeneration?: (generationId: string) => void;
  showTickForImageId?: string | null;
  showTickForSecondaryImageId?: string | null;
  tasksPaneOpen?: boolean;
  tasksPaneWidth?: number;
  adjacentSegments?: AdjacentSegmentsData;
  // Grouped props
  navigation?: LightboxNavigationProps;
  shotWorkflow?: LightboxShotWorkflowProps;
  features?: LightboxFeatureFlags;
  actions?: LightboxActionHandlers;
}

function useImageLightboxEnvironment(props: ImageLightboxProps) {
  const { media, shotId, tasksPaneOpen, tasksPaneWidth } = props;

  const isMobile = useIsMobile();
  const { project, selectedProjectId } = useProject();
  const projectAspectRatio = project?.aspectRatio;

  const { value: generationMethods } = useUserUIState('generationMethods', {
    onComputer: true,
    inCloud: true,
  });
  const isCloudMode = generationMethods.inCloud;
  const isLocalGeneration = generationMethods.onComputer && !generationMethods.inCloud;

  const {
    isTasksPaneOpen: tasksPaneOpenContext,
    tasksPaneWidth: tasksPaneWidthContext,
    isTasksPaneLocked,
  } = usePanes();

  const effectiveTasksPaneOpen = tasksPaneOpen ?? tasksPaneOpenContext;
  const effectiveTasksPaneWidth = tasksPaneWidth ?? tasksPaneWidthContext;

  const contentRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const variantsSectionRef = useRef<HTMLDivElement>(null);

  const [isDownloading, setIsDownloading] = useState(false);
  const [replaceImages, setReplaceImages] = useState(true);
  const [, setVariantParamsToLoad] = useState<Record<string, unknown> | null>(null);

  const actualGenerationId = getGenerationId(media);
  const variantFetchGenerationId = media.parent_generation_id || actualGenerationId;

  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(() => {
    return extractDimensionsFromMedia(media, true);
  });

  useLayoutEffect(() => {
    const dims = extractDimensionsFromMedia(media, true);
    if (dims) {
      setImageDimensions(dims);
    }
  }, [media]);

  const upscaleHook = useUpscale({ media, selectedProjectId, isVideo: false, shotId });

  const editSettingsPersistence = useEditSettingsPersistence({
    generationId: actualGenerationId,
    projectId: selectedProjectId,
    enabled: true,
  });

  const { data: availableLoras } = usePublicLoras();
  const editLoraManager = useLoraManager(availableLoras, {
    projectId: selectedProjectId || undefined,
    persistenceScope: 'none',
    enableProjectPersistence: false,
    disableAutoLoad: true,
  });

  const effectiveEditModeLoRAs = useMemo(() => {
    if (editLoraManager.selectedLoras.length > 0) {
      return editLoraManager.selectedLoras.map((lora) => ({
        url: lora.path,
        strength: lora.strength,
      }));
    }
    return editSettingsPersistence.editModeLoRAs;
  }, [editLoraManager.selectedLoras, editSettingsPersistence.editModeLoRAs]);

  return {
    isMobile,
    selectedProjectId,
    projectAspectRatio,
    isCloudMode,
    isLocalGeneration,
    isTasksPaneLocked,
    effectiveTasksPaneOpen,
    effectiveTasksPaneWidth,
    contentRef,
    imageContainerRef,
    variantsSectionRef,
    isDownloading,
    setIsDownloading,
    replaceImages,
    setReplaceImages,
    setVariantParamsToLoad,
    actualGenerationId,
    variantFetchGenerationId,
    imageDimensions,
    setImageDimensions,
    upscaleHook,
    editSettingsPersistence,
    availableLoras,
    editLoraManager,
    effectiveEditModeLoRAs,
  };
}

type ImageLightboxEnvironment = ReturnType<typeof useImageLightboxEnvironment>;

function useImageLightboxSharedState(props: ImageLightboxProps, env: ImageLightboxEnvironment) {
  const navigation = props.navigation;

  const {
    upscaleHook,
  } = env;

  const handleSlotNavNext = useCallback(() => {
    navigation?.onNext?.();
  }, [navigation]);

  const handleSlotNavPrev = useCallback(() => {
    navigation?.onPrevious?.();
  }, [navigation]);

  const [modeSnapshot, setModeSnapshot] = useState({
    isInpaintMode: false,
    isMagicEditMode: false,
  });

  const sharedInput = useMemo(() => ({
    core: {
      media: props.media,
      isVideo: false,
      selectedProjectId: env.selectedProjectId,
      isMobile: env.isMobile,
      isFormOnlyMode: false,
      onClose: props.onClose,
      readOnly: props.readOnly ?? false,
      variantFetchGenerationId: env.variantFetchGenerationId,
      initialVariantId: props.initialVariantId,
    },
    navigation: {
      showNavigation: navigation?.showNavigation,
      hasNext: navigation?.hasNext ?? false,
      hasPrevious: navigation?.hasPrevious ?? false,
      handleSlotNavNext,
      handleSlotNavPrev,
      swipeDisabled: modeSnapshot.isMagicEditMode || (props.readOnly ?? false),
    },
    shots: {
      shotId: props.shotId,
      selectedShotId: props.shotWorkflow?.selectedShotId,
      allShots: props.shotWorkflow?.allShots,
      onShotChange: props.shotWorkflow?.onShotChange,
      onAddToShot: props.shotWorkflow?.onAddToShot,
      onAddToShotWithoutPosition: props.shotWorkflow?.onAddToShotWithoutPosition,
      onNavigateToShot: props.shotWorkflow?.onNavigateToShot,
      onShowTick: props.shotWorkflow?.onShowTick,
      onShowSecondaryTick: props.shotWorkflow?.onShowSecondaryTick,
      onOptimisticPositioned: props.shotWorkflow?.onOptimisticPositioned,
      onOptimisticUnpositioned: props.shotWorkflow?.onOptimisticUnpositioned,
      optimisticPositionedIds: props.shotWorkflow?.optimisticPositionedIds,
      optimisticUnpositionedIds: props.shotWorkflow?.optimisticUnpositionedIds,
      positionedInSelectedShot: props.shotWorkflow?.positionedInSelectedShot,
      associatedWithoutPositionInSelectedShot: props.shotWorkflow?.associatedWithoutPositionInSelectedShot,
    },
    layout: {
      showTaskDetails: props.features?.showTaskDetails,
      isSpecialEditMode: modeSnapshot.isMagicEditMode,
      isInpaintMode: modeSnapshot.isInpaintMode,
      isMagicEditMode: modeSnapshot.isMagicEditMode,
    },
    actions: {
      isCloudMode: env.isCloudMode,
      showDownload: props.features?.showDownload,
      isDownloading: env.isDownloading,
      setIsDownloading: env.setIsDownloading,
      onDelete: props.actions?.onDelete,
      isDeleting: props.actions?.isDeleting,
      isUpscaling: env.upscaleHook.isUpscaling,
      handleUpscale: () => {
        void env.upscaleHook.handleUpscale({ scaleFactor: 2, noiseScale: 0.1 });
      },
    },
    media: {
      effectiveImageUrl: env.upscaleHook.effectiveImageUrl,
      imageDimensions: env.imageDimensions || { width: 1024, height: 1024 },
      projectAspectRatio: env.projectAspectRatio,
    },
    starred: props.actions?.starred,
    onOpenExternalGeneration: props.onOpenExternalGeneration,
  }), [
    env.selectedProjectId,
    env.isMobile,
    env.variantFetchGenerationId,
    env.isCloudMode,
    env.isDownloading,
    env.setIsDownloading,
    env.upscaleHook,
    env.imageDimensions,
    env.projectAspectRatio,
    props.media,
    props.onClose,
    props.readOnly,
    props.initialVariantId,
    props.shotId,
    props.shotWorkflow,
    props.features?.showTaskDetails,
    props.features?.showDownload,
    props.actions,
    props.onOpenExternalGeneration,
    navigation?.showNavigation,
    navigation?.hasNext,
    navigation?.hasPrevious,
    handleSlotNavNext,
    handleSlotNavPrev,
    modeSnapshot.isMagicEditMode,
    modeSnapshot.isInpaintMode,
  ]);
  const sharedState = useSharedLightboxState(sharedInput);

  useEffect(() => {
    upscaleHook.setActiveVariant(sharedState.variants.activeVariant?.location, sharedState.variants.activeVariant?.id);
  }, [
    sharedState.variants.activeVariant?.location,
    sharedState.variants.activeVariant?.id,
    upscaleHook,
  ]);

  return {
    sharedState,
    handleSlotNavNext,
    handleSlotNavPrev,
    modeSnapshot,
    setModeSnapshot,
  };
}

type ImageLightboxSharedModel = ReturnType<typeof useImageLightboxSharedState>;

function useImageLightboxEditing(
  props: ImageLightboxProps,
  env: ImageLightboxEnvironment,
  sharedModel: ImageLightboxSharedModel,
) {
  const {
    media,
    taskDetailsData,
    initialVariantId,
    toolTypeOverride,
    shotId,
  } = props;
  const initialActive = props.features?.initialEditActive ?? false;

  const {
    selectedProjectId,
    actualGenerationId,
    imageDimensions,
    imageContainerRef,
    editSettingsPersistence,
    effectiveEditModeLoRAs,
    availableLoras,
    variantFetchGenerationId,
  } = env;

  const {
    sharedState,
    setModeSnapshot,
  } = sharedModel;

  const editOrchestrator = useImageEditOrchestrator({
    mediaContext: {
      media,
      selectedProjectId,
      actualGenerationId,
      shotId,
      toolTypeOverride,
      initialActive,
      thumbnailUrl: sharedState.variants.activeVariant?.thumbnail_url || media.thumbUrl,
    },
    displayContext: {
      imageDimensions,
      imageContainerRef,
      effectiveImageUrl: env.upscaleHook.effectiveImageUrl,
    },
    variantContext: {
      activeVariant: sharedState.variants.activeVariant,
      setActiveVariantId: sharedState.variants.setActiveVariantId,
      refetchVariants: sharedState.variants.refetch,
    },
    settingsContext: editSettingsPersistence,
    loraContext: {
      effectiveEditModeLoRAs,
      availableLoras,
    },
  });

  useEffect(() => {
    setModeSnapshot((current) => {
      if (
        current.isInpaintMode === editOrchestrator.isInpaintMode
        && current.isMagicEditMode === editOrchestrator.isMagicEditMode
      ) {
        return current;
      }
      return {
        isInpaintMode: editOrchestrator.isInpaintMode,
        isMagicEditMode: editOrchestrator.isMagicEditMode,
      };
    });
  }, [
    editOrchestrator.isInpaintMode,
    editOrchestrator.isMagicEditMode,
    setModeSnapshot,
  ]);

  const { adjustedTaskDetailsData } = useAdjustedTaskDetails({
    projectId: selectedProjectId ?? null,
    activeVariant: sharedState.variants.activeVariant,
    taskDetailsData,
    isLoadingVariants: sharedState.variants.isLoading,
    initialVariantId,
  });

  usePanelModeRestore({
    mediaId: media.id,
    persistedPanelMode: editSettingsPersistence.panelMode,
    isVideo: false,
    isSpecialEditMode: editOrchestrator.isSpecialEditMode,
    isInVideoEditMode: false,
    initialVideoTrimMode: false,
    initialEditActive: initialActive,
    handleEnterMagicEditMode: editOrchestrator.handleEnterMagicEditMode,
  });

  const variantBadges = useLightboxVariantBadges({
    pendingTaskGenerationId: env.actualGenerationId,
    selectedProjectId,
    variants: sharedState.variants.list,
    variantFetchGenerationId,
  });

  return {
    editOrchestrator,
    adjustedTaskDetailsData,
    variantBadges,
  };
}

type ImageLightboxEditModel = ReturnType<typeof useImageLightboxEditing>;

function useImageLightboxControlsPanel(
  props: ImageLightboxProps,
  env: ImageLightboxEnvironment,
  sharedModel: ImageLightboxSharedModel,
  editModel: ImageLightboxEditModel,
  showPanel: boolean,
  panelVariant: 'desktop' | 'mobile',
  panelTaskId: string | null,
) {
  const {
    media,
    shotId,
    onOpenExternalGeneration,
  } = props;
  const allShots = props.shotWorkflow?.allShots;
  const selectedShotId = props.shotWorkflow?.selectedShotId;
  const showImageEditTools = props.features?.showImageEditTools ?? true;

  const {
    sharedState,
  } = sharedModel;

  const { editOrchestrator, adjustedTaskDetailsData } = editModel;
  const primaryVariantId = sharedState.variants.primaryVariant?.id;

  return useMemo(() => {
    if (!showPanel) {
      return undefined;
    }

    if (editOrchestrator.isSpecialEditMode) {
      return (
        <EditModePanel
          variant={panelVariant}
          sourceGenerationData={sharedState.sourceGeneration.data}
          onOpenExternalGeneration={onOpenExternalGeneration}
          currentShotId={selectedShotId || shotId}
          allShots={allShots || []}
          isCurrentMediaPositioned={sharedState.shots.isAlreadyPositionedInSelectedShot}
          onReplaceInShot={() => Promise.resolve()}
          sourcePrimaryVariant={sharedState.sourceGeneration.primaryVariant}
          onMakeMainVariant={sharedState.makeMainVariant.handle}
          canMakeMainVariant={sharedState.makeMainVariant.canMake}
          taskId={panelTaskId}
          currentMediaId={media.id}
          handleUnifiedGenerate={editOrchestrator.handleUnifiedGenerate}
          handleGenerateAnnotatedEdit={editOrchestrator.handleGenerateAnnotatedEdit}
          handleGenerateReposition={editOrchestrator.handleGenerateReposition}
          handleSaveAsVariant={editOrchestrator.handleSaveAsVariant}
          handleGenerateImg2Img={editOrchestrator.handleGenerateImg2Img}
          isCloudMode={env.isCloudMode}
          handleUpscale={async () => {
            await env.upscaleHook.handleUpscale({ scaleFactor: 2, noiseScale: 0.1 });
          }}
          isUpscaling={env.upscaleHook.isUpscaling}
          upscaleSuccess={env.upscaleHook.upscaleSuccess}
          img2imgLoraManager={editOrchestrator.img2imgLoraManager}
          editLoraManager={env.editLoraManager}
          availableLoras={env.availableLoras}
          advancedSettings={env.editSettingsPersistence.advancedSettings}
          setAdvancedSettings={env.editSettingsPersistence.setAdvancedSettings}
          isLocalGeneration={env.isLocalGeneration}
        />
      );
    }

    return (
      <InfoPanel
        variant={panelVariant}
        showImageEditTools={showImageEditTools}
        taskDetailsData={adjustedTaskDetailsData}
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
        onSwitchToPrimary={primaryVariantId
          ? () => sharedState.variants.setActiveVariantId(primaryVariantId)
          : undefined}
        taskId={panelTaskId}
      />
    );
  }, [
    showPanel,
    editOrchestrator.isSpecialEditMode,
    panelVariant,
    sharedState.sourceGeneration.data,
    onOpenExternalGeneration,
    selectedShotId,
    shotId,
    allShots,
    sharedState.shots.isAlreadyPositionedInSelectedShot,
    sharedState.sourceGeneration.primaryVariant,
    sharedState.makeMainVariant.handle,
    sharedState.makeMainVariant.canMake,
    panelTaskId,
    media.id,
    editOrchestrator.handleUnifiedGenerate,
    editOrchestrator.handleGenerateAnnotatedEdit,
    editOrchestrator.handleGenerateReposition,
    editOrchestrator.handleSaveAsVariant,
    editOrchestrator.handleGenerateImg2Img,
    env.isCloudMode,
    env.upscaleHook,
    editOrchestrator.img2imgLoraManager,
    env.editLoraManager,
    env.availableLoras,
    env.editSettingsPersistence.advancedSettings,
    env.editSettingsPersistence.setAdvancedSettings,
    env.isLocalGeneration,
    showImageEditTools,
    adjustedTaskDetailsData,
    primaryVariantId,
    sharedState.lineage.derivedItems,
    sharedState.lineage.derivedGenerations,
    sharedState.lineage.paginatedDerived,
    sharedState.lineage.derivedPage,
    sharedState.lineage.derivedTotalPages,
    sharedState.lineage.setDerivedPage,
    env.replaceImages,
    env.setReplaceImages,
    sharedState.variants,
  ]);
}

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

  const handleDownload = () => handleLightboxDownload({
    intendedVariantId: sharedState.intendedActiveVariantIdRef.current,
    variants: sharedState.variants.list,
    fallbackUrl: sharedState.effectiveMedia.mediaUrl ?? '',
    media,
    isVideo: false,
    setIsDownloading: env.setIsDownloading,
  });

  const handleDelete = useCallback(async (): Promise<void> => {
    if (!actions?.onDelete) {
      return;
    }
    await invokeLightboxDelete(actions.onDelete, media.id, 'ImageLightbox.delete');
  }, [actions?.onDelete, media.id]);

  const handleApplySettings = () => {
    actions?.onApplySettings?.(media.metadata);
  };

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
  const allShots = shotWorkflow?.allShots ?? [];
  const selectedShotId = shotWorkflow?.selectedShotId;
  const workflowBar = useMemo(() => ({
    onAddToShot: shotWorkflow?.onAddToShot,
    onDelete: actions?.onDelete,
    onApplySettings: actions?.onApplySettings,
    isSpecialEditMode: editOrchestrator.isSpecialEditMode,
    isVideo: false,
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
  } satisfies WorkflowControlsBarProps), [
    shotWorkflow?.onAddToShot,
    actions?.onDelete,
    actions?.onApplySettings,
    editOrchestrator.isSpecialEditMode,
    env.actualGenerationId,
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
    env.contentRef,
    handleApplySettings,
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
