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
import type { GenerationRow, GenerationMetadata, Shot } from '@/types/shots';
import type { AdjacentSegmentsData, ShotOption, TaskDetailsData } from './types';

import { useProject } from '@/shared/contexts/ProjectContext';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import { useIsMobile } from '@/shared/hooks/use-mobile';

import {
  useUpscale,
  useEditSettingsPersistence,
  usePanelModeRestore,
  useAdjustedTaskDetails,
  useSharedLightboxState,
  useLightboxStateValue,
  useLightboxWorkflowProps,
  useLightboxVariantBadges,
  useImageEditOrchestrator,
} from './hooks';

import { LightboxShell, LightboxProviders } from './components';
import { LightboxLayout } from './components/layouts/LightboxLayout';
import { EditModePanel } from './components/EditModePanel';
import { InfoPanel } from './components/InfoPanel';
import { ImageEditProvider } from './contexts/ImageEditContext';

import { extractDimensionsFromMedia, handleLightboxDownload } from './utils';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';

interface ImageLightboxProps {
  media: GenerationRow;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  readOnly?: boolean;
  showNavigation?: boolean;
  showImageEditTools?: boolean;
  showDownload?: boolean;
  showMagicEdit?: boolean;
  autoEnterInpaint?: boolean;
  hasNext?: boolean;
  hasPrevious?: boolean;
  allShots?: ShotOption[];
  selectedShotId?: string;
  onShotChange?: (shotId: string) => void;
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDelete?: (id: string) => void;
  isDeleting?: string | null;
  onApplySettings?: (metadata: GenerationMetadata | undefined) => void;
  showTickForImageId?: string | null;
  onShowTick?: (imageId: string) => void;
  showTickForSecondaryImageId?: string | null;
  onShowSecondaryTick?: (imageId: string) => void;
  starred?: boolean;
  onToggleStar?: (id: string, starred: boolean) => void;
  showTaskDetails?: boolean;
  taskDetailsData?: TaskDetailsData;
  onShowTaskDetails?: () => void;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{shotId?: string; shotName?: string} | void>;
  onNavigateToShot?: (shot: Shot, options?: { isNewlyCreated?: boolean }) => void;
  toolTypeOverride?: string;
  optimisticPositionedIds?: Set<string>;
  optimisticUnpositionedIds?: Set<string>;
  onOptimisticPositioned?: (mediaId: string, shotId: string) => void;
  onOptimisticUnpositioned?: (mediaId: string, shotId: string) => void;
  positionedInSelectedShot?: boolean;
  associatedWithoutPositionInSelectedShot?: boolean;
  onNavigateToGeneration?: (generationId: string) => void;
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  shotId?: string;
  tasksPaneOpen?: boolean;
  tasksPaneWidth?: number;
  initialVariantId?: string;
  adjacentSegments?: AdjacentSegmentsData;
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
  const {
    media,
    onClose,
    onNext,
    onPrevious,
    readOnly = false,
    showNavigation = true,
    hasNext = false,
    hasPrevious = false,
    allShots,
    selectedShotId,
    onShotChange,
    onAddToShot,
    onAddToShotWithoutPosition,
    onDelete,
    isDeleting,
    showTaskDetails = false,
    starred,
    onOpenExternalGeneration,
    shotId,
    initialVariantId,
    onNavigateToShot,
    onShowTick,
    onShowSecondaryTick,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    positionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
    showDownload = true,
  } = props;

  const {
    selectedProjectId,
    isMobile,
    variantFetchGenerationId,
    isCloudMode,
    isDownloading,
    setIsDownloading,
    imageDimensions,
    projectAspectRatio,
    upscaleHook,
  } = env;

  const handleSlotNavNext = useCallback(() => {
    if (onNext) {
      onNext();
    }
  }, [onNext]);

  const handleSlotNavPrev = useCallback(() => {
    if (onPrevious) {
      onPrevious();
    }
  }, [onPrevious]);

  const isInpaintModeRef = useRef(false);
  const isMagicEditModeRef = useRef(false);

  const sharedState = useSharedLightboxState({
    media,
    isVideo: false,
    selectedProjectId,
    isMobile,
    isFormOnlyMode: false,
    onClose,
    readOnly,
    variantFetchGenerationId,
    initialVariantId,
    starred,
    onOpenExternalGeneration,
    showNavigation,
    hasNext,
    hasPrevious,
    handleSlotNavNext,
    handleSlotNavPrev,
    swipeDisabled: isMagicEditModeRef.current || readOnly,
    shotId,
    selectedShotId,
    allShots,
    onShotChange,
    onAddToShot,
    onAddToShotWithoutPosition,
    onNavigateToShot,
    onShowTick,
    onShowSecondaryTick,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    positionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
    showTaskDetails,
    isSpecialEditMode: isMagicEditModeRef.current,
    isInpaintMode: isInpaintModeRef.current,
    isMagicEditMode: isMagicEditModeRef.current,
    isCloudMode,
    showDownload,
    isDownloading,
    setIsDownloading,
    onDelete,
    isDeleting,
    isUpscaling: upscaleHook.isUpscaling,
    handleUpscale: () => {
      void upscaleHook.handleUpscale({ scaleFactor: 2, noiseScale: 0.1 });
    },
    handleEnterMagicEditMode: () => {},
    effectiveImageUrl: upscaleHook.effectiveImageUrl,
    imageDimensions: imageDimensions || { width: 1024, height: 1024 },
    projectAspectRatio,
  });

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
    isInpaintModeRef,
    isMagicEditModeRef,
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
    autoEnterInpaint = false,
    toolTypeOverride,
    shotId,
  } = props;

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
    isInpaintModeRef,
    isMagicEditModeRef,
  } = sharedModel;

  const editOrchestrator = useImageEditOrchestrator({
    media,
    selectedProjectId,
    actualGenerationId,
    shotId,
    toolTypeOverride,
    autoEnterInpaint,
    imageDimensions,
    imageContainerRef,
    effectiveImageUrl: env.upscaleHook.effectiveImageUrl,
    activeVariant: sharedState.variants.activeVariant,
    setActiveVariantId: sharedState.variants.setActiveVariantId,
    refetchVariants: sharedState.variants.refetch,
    editSettingsPersistence,
    effectiveEditModeLoRAs,
    availableLoras,
    thumbnailUrl: sharedState.variants.activeVariant?.thumbnail_url || media.thumbUrl,
  });

  isInpaintModeRef.current = editOrchestrator.isInpaintMode;
  isMagicEditModeRef.current = editOrchestrator.isMagicEditMode;

  const { adjustedTaskDetailsData } = useAdjustedTaskDetails({
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
    autoEnterInpaint,
    handleEnterVideoEditMode: () => {},
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
    allShots,
    selectedShotId,
    shotId,
    onOpenExternalGeneration,
    showImageEditTools = true,
  } = props;

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
    env.upscaleHook.handleUpscale,
    env.upscaleHook.isUpscaling,
    env.upscaleHook.upscaleSuccess,
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
    showNavigation = true,
    hasNext = false,
    hasPrevious = false,
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
    showTickForImageId,
    showTickForSecondaryImageId,
    onShowTick,
    onShowSecondaryTick,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
    onNavigateToShot,
    adjacentSegments,
  } = props;

  const { sharedState, handleSlotNavNext, handleSlotNavPrev } = sharedModel;
  const { editOrchestrator, adjustedTaskDetailsData, variantBadges } = editModel;

  const lightboxStateValue = useLightboxStateValue({
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
    variants: sharedState.variants.list,
    activeVariant: sharedState.variants.activeVariant,
    primaryVariant: sharedState.variants.primaryVariant,
    isLoadingVariants: sharedState.variants.isLoading,
    setActiveVariantId: sharedState.variants.setActiveVariantId,
    setPrimaryVariant: sharedState.variants.setPrimaryVariant,
    deleteVariant: sharedState.variants.deleteVariant,
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
    showNavigation,
    hasNext,
    hasPrevious,
    handleSlotNavNext,
    handleSlotNavPrev,
    swipeNavigation: sharedState.navigation.swipeNavigation,
  });

  const handleDownload = () => handleLightboxDownload({
    intendedVariantId: sharedState.intendedActiveVariantIdRef.current,
    variants: sharedState.variants.list,
    fallbackUrl: sharedState.effectiveMedia.mediaUrl ?? '',
    media,
    isVideo: false,
    setIsDownloading: env.setIsDownloading,
  });

  const handleDelete = () => {
    if (onDelete) {
      onDelete(media.id);
    }
  };

  const handleApplySettings = () => {
    if (onApplySettings) {
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
    || ((media as unknown as Record<string, unknown>)?.source_task_id as string | null)
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

  const { layoutProps } = useLightboxWorkflowProps({
    panel: {
      showPanel,
      shouldShowSidePanel: sharedState.layout.shouldShowSidePanel,
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
    segmentSlotMode: undefined,
  });

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

  return (
    <LightboxProviders stateValue={renderModel.lightboxStateValue}>
      <ImageEditProvider value={editModel.editOrchestrator.imageEditValue}>
        <LightboxShell
          onClose={props.onClose}
          hasCanvasOverlay={editModel.editOrchestrator.isInpaintMode}
          isRepositionMode={editModel.editOrchestrator.isInpaintMode && editModel.editOrchestrator.editMode === 'reposition'}
          isMobile={env.isMobile}
          isTabletOrLarger={sharedModel.sharedState.layout.isTabletOrLarger}
          effectiveTasksPaneOpen={env.effectiveTasksPaneOpen}
          effectiveTasksPaneWidth={env.effectiveTasksPaneWidth}
          isTasksPaneLocked={env.isTasksPaneLocked}
          needsFullscreenLayout={renderModel.needsFullscreenLayout}
          needsTasksPaneOffset={renderModel.needsTasksPaneOffset}
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
