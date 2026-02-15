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

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import type { GenerationRow, GenerationMetadata, Shot } from '@/types/shots';
import type { AdjacentSegmentsData, ShotOption, TaskDetailsData } from './types';

import { useProject } from '@/shared/contexts/ProjectContext';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import { useIsMobile } from '@/shared/hooks/use-mobile';

// Import hooks
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

// Import components
import { LightboxShell, LightboxProviders } from './components';
import { LightboxLayout } from './components/layouts';
import { EditModePanel } from './components/EditModePanel';
import { InfoPanel } from './components/InfoPanel';
import { ImageEditProvider } from './contexts/ImageEditContext';

// Import utils
import { extractDimensionsFromMedia, handleLightboxDownload } from './utils';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';

// ============================================================================
// Props Interface
// ============================================================================

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

// ============================================================================
// Component
// ============================================================================

export const ImageLightbox: React.FC<ImageLightboxProps> = (props) => {
  const {
    media,
    onClose,
    onNext,
    onPrevious,
    readOnly = false,
    showNavigation = true,
    showImageEditTools = true,
    showDownload = true,
    autoEnterInpaint = false,
    hasNext = false,
    hasPrevious = false,
    allShots,
    selectedShotId,
    onShotChange,
    onAddToShot,
    onAddToShotWithoutPosition,
    onDelete,
    isDeleting,
    onApplySettings,
    showTickForImageId,
    onShowTick,
    showTickForSecondaryImageId,
    onShowSecondaryTick,
    starred,
    showTaskDetails = false,
    taskDetailsData,
    onCreateShot,
    onNavigateToShot,
    toolTypeOverride,
    optimisticPositionedIds,
    optimisticUnpositionedIds,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
    onOpenExternalGeneration,
    shotId,
    tasksPaneOpen,
    tasksPaneWidth,
    positionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
    initialVariantId,
    adjacentSegments,
  } = props;

  // ========================================
  // CORE SETUP
  // ========================================

  const isMobile = useIsMobile();
  const { project, selectedProjectId } = useProject();
  const projectAspectRatio = project?.aspect_ratio;
  const { value: generationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  const isCloudMode = generationMethods.inCloud;
  const isLocalGeneration = generationMethods.onComputer && !generationMethods.inCloud;

  const {
    isTasksPaneOpen: tasksPaneOpenContext,
    tasksPaneWidth: tasksPaneWidthContext,
    isTasksPaneLocked,
  } = usePanes();

  const effectiveTasksPaneOpen = tasksPaneOpen ?? tasksPaneOpenContext;
  const effectiveTasksPaneWidth = tasksPaneWidth ?? tasksPaneWidthContext;

  // Refs
  const contentRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const variantsSectionRef = useRef<HTMLDivElement>(null);

  // State
  const [isDownloading, setIsDownloading] = useState(false);
  const [replaceImages, setReplaceImages] = useState(true);
  const [_variantParamsToLoad, setVariantParamsToLoad] = useState<Record<string, unknown> | null>(null);

  const actualGenerationId = getGenerationId(media);
  const variantFetchGenerationId = media.parent_generation_id || actualGenerationId;

  // ========================================
  // IMAGE DIMENSIONS
  // ========================================

  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(() => {
    return extractDimensionsFromMedia(media, true);
  });

  React.useLayoutEffect(() => {
    const dims = extractDimensionsFromMedia(media, true);
    if (dims) setImageDimensions(dims);
  }, [media?.id]);

  // ========================================
  // UPSCALE HOOK
  // ========================================

  const upscaleHook = useUpscale({ media, selectedProjectId, isVideo: false, shotId });
  const {
    effectiveImageUrl,
    isUpscaling,
    upscaleSuccess,
    handleUpscale,
    setActiveVariant: setUpscaleActiveVariant,
  } = upscaleHook;

  // ========================================
  // EDIT SETTINGS PERSISTENCE
  // ========================================

  const editSettingsPersistence = useEditSettingsPersistence({
    generationId: actualGenerationId,
    projectId: selectedProjectId,
    enabled: true,
  });

  // ========================================
  // LORA MANAGEMENT
  // ========================================

  const { data: availableLoras } = usePublicLoras();

  const editLoraManager = useLoraManager(availableLoras, {
    projectId: selectedProjectId || undefined,
    persistenceScope: 'none',
    enableProjectPersistence: false,
    disableAutoLoad: true,
  });

  const effectiveEditModeLoRAs = useMemo(() => {
    if (editLoraManager.selectedLoras.length > 0) {
      return editLoraManager.selectedLoras.map(lora => ({
        url: lora.path,
        strength: lora.strength,
      }));
    }
    return editSettingsPersistence.editModeLoRAs;
  }, [editLoraManager.selectedLoras, editSettingsPersistence.editModeLoRAs]);

  // ========================================
  // SHARED LIGHTBOX STATE
  // ========================================

  const handleSlotNavNext = useCallback(() => {
    if (onNext) onNext();
  }, [onNext]);

  const handleSlotNavPrev = useCallback(() => {
    if (onPrevious) onPrevious();
  }, [onPrevious]);

  // Refs cache the previous render's edit mode flags for useSharedLightboxState,
  // which runs BEFORE useImageEditOrchestrator (orchestrator needs variant data
  // from shared state). Using refs avoids the state-sync anti-pattern (useEffect
  // that only calls setState) and the extra re-render it caused. One-frame delay
  // is acceptable for swipe/layout calculations.
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
    isUpscaling,
    handleUpscale,
    handleEnterMagicEditMode: () => {}, // Will be replaced after orchestrator runs
    effectiveImageUrl,
    imageDimensions: imageDimensions || { width: 1024, height: 1024 },
    projectAspectRatio,
  });

  const {
    variants,
    intendedActiveVariantIdRef,
    navigation,
    lineage,
    shots,
    sourceGeneration,
    makeMainVariant,
    effectiveMedia,
    layout,
    buttonGroupProps,
  } = sharedState;

  // Keep upscale hook in sync with active variant so it enhances the viewed image
  useEffect(() => {
    setUpscaleActiveVariant(variants.activeVariant?.location, variants.activeVariant?.id);
  }, [variants.activeVariant?.location, variants.activeVariant?.id, setUpscaleActiveVariant]);

  // ========================================
  // IMAGE EDIT ORCHESTRATOR
  // ========================================
  // Composes inpainting, magic edit, reposition, img2img hooks.
  // Builds the ImageEditContext value.

  const editOrchestrator = useImageEditOrchestrator({
    media,
    selectedProjectId,
    actualGenerationId,
    shotId,
    toolTypeOverride,
    autoEnterInpaint,
    imageDimensions,
    imageContainerRef,
    effectiveImageUrl,
    activeVariant: variants.activeVariant,
    setActiveVariantId: variants.setActiveVariantId,
    refetchVariants: variants.refetch,
    editSettingsPersistence,
    effectiveEditModeLoRAs,
    availableLoras,
    thumbnailUrl: variants.activeVariant?.thumbnail_url || media.thumbUrl,
  });

  const {
    imageEditValue,
    isSpecialEditMode,
    editMode,
    handleEnterMagicEditMode,
    handleUnifiedGenerate,
    handleGenerateAnnotatedEdit,
    handleGenerateReposition,
    handleSaveAsVariant,
    handleGenerateImg2Img,
    img2imgLoraManager,
  } = editOrchestrator;

  // Update refs so next render's useSharedLightboxState sees current values.
  // No useEffect needed — ref assignment is synchronous and doesn't trigger re-renders.
  isInpaintModeRef.current = editOrchestrator.isInpaintMode;
  isMagicEditModeRef.current = editOrchestrator.isMagicEditMode;

  // ========================================
  // ADJUSTED TASK DETAILS
  // ========================================

  const { adjustedTaskDetailsData } = useAdjustedTaskDetails({
    activeVariant: variants.activeVariant,
    taskDetailsData,
    isLoadingVariants: variants.isLoading,
    initialVariantId,
  });

  // ========================================
  // PANEL MODE RESTORE
  // ========================================

  usePanelModeRestore({
    mediaId: media.id,
    persistedPanelMode: editSettingsPersistence.panelMode,
    isVideo: false,
    isSpecialEditMode,
    isInVideoEditMode: false,
    initialVideoTrimMode: false,
    autoEnterInpaint,
    handleEnterVideoEditMode: () => {},
    handleEnterMagicEditMode,
  });

  // ========================================
  // PENDING TASKS & VARIANT BADGES
  // ========================================

  const { pendingTaskCount, unviewedVariantCount, handleMarkAllViewed } = useLightboxVariantBadges({
    pendingTaskGenerationId: actualGenerationId,
    selectedProjectId,
    variants: variants.list,
    variantFetchGenerationId,
  });

  // ========================================
  // CONTEXT VALUE
  // ========================================

  const lightboxStateValue = useLightboxStateValue({
    onClose,
    readOnly,
    isMobile,
    isTabletOrLarger: layout.isTabletOrLarger,
    selectedProjectId,
    actualGenerationId,
    media,
    isVideo: false,
    effectiveMediaUrl: effectiveMedia.mediaUrl,
    effectiveVideoUrl: '',
    effectiveImageDimensions: effectiveMedia.imageDimensions,
    imageDimensions,
    setImageDimensions,
    variants: variants.list,
    activeVariant: variants.activeVariant,
    primaryVariant: variants.primaryVariant,
    isLoadingVariants: variants.isLoading,
    setActiveVariantId: variants.setActiveVariantId,
    setPrimaryVariant: variants.setPrimaryVariant,
    deleteVariant: variants.deleteVariant,
    onLoadVariantSettings: setVariantParamsToLoad,
    promoteSuccess: variants.promoteSuccess,
    isPromoting: variants.isPromoting,
    handlePromoteToGeneration: variants.handlePromoteToGeneration,
    isMakingMainVariant: makeMainVariant.isMaking,
    canMakeMainVariant: makeMainVariant.canMake,
    handleMakeMainVariant: makeMainVariant.handle,
    pendingTaskCount,
    unviewedVariantCount,
    onMarkAllViewed: handleMarkAllViewed,
    variantsSectionRef,
    showNavigation,
    hasNext,
    hasPrevious,
    handleSlotNavNext,
    handleSlotNavPrev,
    swipeNavigation: navigation.swipeNavigation,
  });

  // ========================================
  // DOWNLOAD HANDLER
  // ========================================

  const handleDownload = () => handleLightboxDownload({
    intendedVariantId: intendedActiveVariantIdRef.current,
    variants: variants.list,
    fallbackUrl: effectiveMedia.mediaUrl,
    media,
    isVideo: false,
    setIsDownloading,
  });

  const handleDelete = () => {
    if (onDelete) onDelete(media.id);
  };

  const handleApplySettings = () => {
    if (onApplySettings) onApplySettings(media.metadata);
  };

  const handleNavigateToShotFromSelector = useCallback((shot: { id: string; name: string }) => {
    if (onNavigateToShot) {
      const minimalShot = { id: shot.id, name: shot.name, images: [], position: 0 };
      onClose();
      onNavigateToShot(minimalShot);
    }
  }, [onNavigateToShot, onClose]);

  // ========================================
  // LAYOUT DECISIONS
  // ========================================

  const needsFullscreenLayout = true;
  const needsTasksPaneOffset = needsFullscreenLayout && (effectiveTasksPaneOpen || isTasksPaneLocked) && !layout.isPortraitMode && layout.isTabletOrLarger;

  const accessibilityTitle = `Image Lightbox - ${media?.id?.substring(0, 8)}`;
  const accessibilityDescription = 'View and interact with image in full screen. Use arrow keys to navigate, Escape to close.';

  // ========================================
  // SHOW PANEL DECISION
  // ========================================

  const showPanel = layout.shouldShowSidePanel || ((showTaskDetails || isSpecialEditMode) && isMobile);

  // ========================================
  // BUILD CONTROLS PANEL CONTENT
  // ========================================

  const panelVariant = (layout.shouldShowSidePanel && !isMobile) ? 'desktop' as const : 'mobile' as const;
  const panelTaskId = adjustedTaskDetailsData?.taskId || (media as unknown as Record<string, unknown>)?.source_task_id as string | null || null;

  const controlsPanelContent = useMemo(() => {
    if (!showPanel) return undefined;

    if (isSpecialEditMode) {
      return (
        <EditModePanel
          variant={panelVariant}
          sourceGenerationData={sourceGeneration.data}
          onOpenExternalGeneration={onOpenExternalGeneration}
          currentShotId={selectedShotId || shotId}
          allShots={allShots || []}
          isCurrentMediaPositioned={shots.isAlreadyPositionedInSelectedShot}
          onReplaceInShot={() => Promise.resolve()}
          sourcePrimaryVariant={sourceGeneration.primaryVariant}
          onMakeMainVariant={makeMainVariant.handle}
          canMakeMainVariant={makeMainVariant.canMake}
          taskId={panelTaskId}
          currentMediaId={media.id}
          handleUnifiedGenerate={handleUnifiedGenerate}
          handleGenerateAnnotatedEdit={handleGenerateAnnotatedEdit}
          handleGenerateReposition={handleGenerateReposition}
          handleSaveAsVariant={handleSaveAsVariant}
          handleGenerateImg2Img={handleGenerateImg2Img}
          isCloudMode={isCloudMode}
          handleUpscale={handleUpscale}
          isUpscaling={isUpscaling}
          upscaleSuccess={upscaleSuccess}
          img2imgLoraManager={img2imgLoraManager}
          editLoraManager={editLoraManager}
          availableLoras={availableLoras}
          advancedSettings={editSettingsPersistence.advancedSettings}
          setAdvancedSettings={editSettingsPersistence.setAdvancedSettings}
          isLocalGeneration={isLocalGeneration}
        />
      );
    }

    return (
      <InfoPanel
        variant={panelVariant}
        showImageEditTools={showImageEditTools}
        taskDetailsData={adjustedTaskDetailsData}
        derivedItems={lineage.derivedItems}
        derivedGenerations={lineage.derivedGenerations}
        paginatedDerived={lineage.paginatedDerived}
        derivedPage={lineage.derivedPage}
        derivedTotalPages={lineage.derivedTotalPages}
        onSetDerivedPage={lineage.setDerivedPage}
        onNavigateToGeneration={onOpenExternalGeneration}
        currentMediaId={media.id}
        currentShotId={selectedShotId || shotId}
        replaceImages={replaceImages}
        onReplaceImagesChange={setReplaceImages}
        onSwitchToPrimary={variants.primaryVariant ? () => variants.setActiveVariantId(variants.primaryVariant.id) : undefined}
        taskId={panelTaskId}
      />
    );
  }, [
    showPanel, isSpecialEditMode, panelVariant, panelTaskId,
    sourceGeneration.data, onOpenExternalGeneration, selectedShotId, shotId, allShots,
    shots.isAlreadyPositionedInSelectedShot, sourceGeneration.primaryVariant,
    makeMainVariant.handle, makeMainVariant.canMake, media.id,
    handleUnifiedGenerate, handleGenerateAnnotatedEdit, handleGenerateReposition,
    handleSaveAsVariant, handleGenerateImg2Img, isCloudMode, handleUpscale,
    isUpscaling, upscaleSuccess, img2imgLoraManager, editLoraManager, availableLoras,
    editSettingsPersistence.advancedSettings, editSettingsPersistence.setAdvancedSettings, isLocalGeneration,
    showImageEditTools, adjustedTaskDetailsData, lineage.derivedItems,
    lineage.derivedGenerations, lineage.paginatedDerived, lineage.derivedPage,
    lineage.derivedTotalPages, lineage.setDerivedPage, replaceImages, setReplaceImages,
    variants.primaryVariant, variants.setActiveVariantId,
  ]);

  // ========================================
  // BUILD LAYOUT PROPS
  // ========================================

  const { layoutProps } = useLightboxWorkflowProps({
    panel: {
      showPanel,
      shouldShowSidePanel: layout.shouldShowSidePanel,
      effectiveTasksPaneOpen,
      effectiveTasksPaneWidth,
    },
    shotWorkflow: {
      allShots: allShots || [],
      selectedShotId,
      onShotChange,
      onCreateShot,
      onAddToShot,
      onAddToShotWithoutPosition,
      isAlreadyPositionedInSelectedShot: shots.isAlreadyPositionedInSelectedShot,
      isAlreadyAssociatedWithoutPosition: shots.isAlreadyAssociatedWithoutPosition,
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
      handleAddVariantAsNewGenerationToShot: variants.handleAddVariantAsNewGenerationToShot,
    },
    buttonGroupProps: {
      ...buttonGroupProps,
      topRight: {
        ...buttonGroupProps.topRight,
        handleDownload,
        handleDelete,
      },
    },
    contentRef,
    adjacentSegments,
    segmentSlotMode: undefined,
  });

  // ========================================
  // RENDER
  // ========================================

  return (
    <LightboxProviders stateValue={lightboxStateValue}>
      <ImageEditProvider value={imageEditValue}>
        <LightboxShell
          onClose={onClose}
          hasCanvasOverlay={editOrchestrator.isInpaintMode}
          isRepositionMode={editOrchestrator.isInpaintMode && editMode === 'reposition'}
          isMobile={isMobile}
          isTabletOrLarger={layout.isTabletOrLarger}
          effectiveTasksPaneOpen={effectiveTasksPaneOpen}
          effectiveTasksPaneWidth={effectiveTasksPaneWidth}
          isTasksPaneLocked={isTasksPaneLocked}
          needsFullscreenLayout={needsFullscreenLayout}
          needsTasksPaneOffset={needsTasksPaneOffset}
          contentRef={contentRef}
          accessibilityTitle={accessibilityTitle}
          accessibilityDescription={accessibilityDescription}
        >
          <LightboxLayout {...layoutProps} controlsPanelContent={controlsPanelContent} />
        </LightboxShell>
      </ImageEditProvider>
    </LightboxProviders>
  );
};
