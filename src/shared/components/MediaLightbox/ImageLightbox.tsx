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
 *
 * This is part of the split architecture where MediaLightbox dispatches to
 * ImageLightbox or VideoLightbox based on media type.
 */

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import type { GenerationRow, GenerationMetadata, GenerationParams, Shot } from '@/types/shots';
import type { SegmentSlotModeData, AdjacentSegmentsData, ShotOption, TaskDetailsData } from './types';
import { ASPECT_RATIO_TO_RESOLUTION, findClosestAspectRatio, parseRatio } from '@/shared/lib/aspectRatios';
import { useProject } from '@/shared/contexts/ProjectContext';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useTaskStatusCounts } from '@/shared/hooks/useTasks';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { usePublicLoras } from '@/shared/hooks/useResources';
import { useLoraManager } from '@/shared/hooks/useLoraManager';
import { usePendingGenerationTasks } from '@/shared/hooks/usePendingGenerationTasks';
import { useMarkVariantViewed } from '@/shared/hooks/useMarkVariantViewed';
import { useIsMobile } from '@/shared/hooks/use-mobile';

// Import hooks
import {
  useUpscale,
  useInpainting,
  useMagicEditMode,
  useRepositionMode,
  useImg2ImgMode,
  useEditSettingsPersistence,
  useEditSettingsSync,
  usePanelModeRestore,
  useAdjustedTaskDetails,
  useSharedLightboxState,
  useLightboxStateValue,
  useLightboxLayoutProps,
} from './hooks';

// Import components
import { LightboxShell, LightboxProviders } from './components';
import { LightboxLayout } from './components/layouts';
import { ImageEditProvider, type ImageEditState } from './contexts/ImageEditContext';
import { EditFormProvider, type EditFormState } from './contexts/EditFormContext';

// Import utils
import { downloadMedia } from './utils';
import { readSegmentOverrides } from '@/shared/utils/settingsMigration';
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
    positionedInSelectedShot,
    associatedWithoutPositionInSelectedShot,
    onOpenExternalGeneration,
    shotId,
    tasksPaneOpen,
    tasksPaneWidth,
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

  // Panes context for tasks pane
  const {
    isTasksPaneOpen: tasksPaneOpenContext,
    tasksPaneWidth: tasksPaneWidthContext,
    isTasksPaneLocked,
  } = usePanes();

  // Use prop values if provided, else fall back to context
  const effectiveTasksPaneOpen = tasksPaneOpen ?? tasksPaneOpenContext;
  const effectiveTasksPaneWidth = tasksPaneWidth ?? tasksPaneWidthContext;


  // Refs
  const contentRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const variantsSectionRef = useRef<HTMLDivElement>(null);

  // State
  const [isDownloading, setIsDownloading] = useState(false);
  const [replaceImages, setReplaceImages] = useState(true);
  const [variantParamsToLoad, setVariantParamsToLoad] = useState<Record<string, unknown> | null>(null);

  // Compute actual generation ID
  // For timeline images, media.id is shot_generations.id, not the generation ID
  // So we need to prefer media.generation_id for variant fetching
  const actualGenerationId = getGenerationId(media);
  const variantFetchGenerationId = media.parent_generation_id || actualGenerationId;

  // ========================================
  // IMAGE DIMENSIONS
  // ========================================

  const resolutionToDimensions = (resolution: string): { width: number; height: number } | null => {
    if (!resolution || typeof resolution !== 'string' || !resolution.includes('x')) return null;
    const [w, h] = resolution.split('x').map(Number);
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      return { width: w, height: h };
    }
    return null;
  };

  const aspectRatioToDimensions = (aspectRatio: string): { width: number; height: number } | null => {
    if (!aspectRatio) return null;
    const directResolution = ASPECT_RATIO_TO_RESOLUTION[aspectRatio];
    if (directResolution) return resolutionToDimensions(directResolution);
    const ratio = parseRatio(aspectRatio);
    if (!isNaN(ratio)) {
      const closestAspectRatio = findClosestAspectRatio(ratio);
      const closestResolution = ASPECT_RATIO_TO_RESOLUTION[closestAspectRatio];
      if (closestResolution) return resolutionToDimensions(closestResolution);
    }
    return null;
  };

  const extractDimensionsFromMedia = useCallback((mediaObj: typeof media): { width: number; height: number } | null => {
    if (!mediaObj) return null;
    const params = mediaObj.params as GenerationParams | undefined;
    const metadata = mediaObj.metadata as Record<string, unknown> | undefined;

    // Check metadata for width/height (these may exist as extended metadata fields)
    if (metadata?.width && metadata?.height && typeof metadata.width === 'number' && typeof metadata.height === 'number') {
      return { width: metadata.width, height: metadata.height };
    }

    const resolutionSources = [
      params?.resolution,
      (params as Record<string, unknown>)?.originalParams,
      (params as Record<string, unknown>)?.orchestrator_details,
      metadata?.resolution,
      (metadata?.originalParams as Record<string, unknown> | undefined)?.resolution,
      ((metadata?.originalParams as Record<string, unknown> | undefined)?.orchestrator_details as Record<string, unknown> | undefined)?.resolution,
    ];
    for (const res of resolutionSources) {
      if (typeof res === 'string') {
        const dims = resolutionToDimensions(res);
        if (dims) return dims;
      }
    }

    const aspectRatioSources = [
      params?.aspect_ratio,
      (params as Record<string, unknown>)?.custom_aspect_ratio,
      (params as Record<string, unknown>)?.originalParams,
      (params as Record<string, unknown>)?.orchestrator_details,
      metadata?.aspect_ratio,
      (metadata?.originalParams as Record<string, unknown> | undefined)?.aspect_ratio,
      ((metadata?.originalParams as Record<string, unknown> | undefined)?.orchestrator_details as Record<string, unknown> | undefined)?.aspect_ratio,
    ];
    for (const ar of aspectRatioSources) {
      if (ar && typeof ar === 'string') {
        const dims = aspectRatioToDimensions(ar);
        if (dims) return dims;
      }
    }

    return null;
  }, []);

  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(() => {
    return extractDimensionsFromMedia(media);
  });

  React.useLayoutEffect(() => {
    const dims = extractDimensionsFromMedia(media);
    if (dims) setImageDimensions(dims);
  }, [media?.id, extractDimensionsFromMedia]);

  // ========================================
  // UPSCALE HOOK
  // ========================================

  const upscaleHook = useUpscale({ media, selectedProjectId, isVideo: false, shotId });
  const {
    effectiveImageUrl,
    sourceUrlForTasks,
    isUpscaling,
    upscaleSuccess,
    showingUpscaled,
    isPendingUpscale,
    hasUpscaledVersion,
    handleUpscale,
    handleToggleUpscaled,
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
  const {
    loraMode,
    setLoraMode,
    customLoraUrl,
    setCustomLoraUrl,
    prompt: persistedPrompt,
    setPrompt: setPersistedPrompt,
    numGenerations: persistedNumGenerations,
    setNumGenerations: setPersistedNumGenerations,
    img2imgStrength: persistedImg2imgStrength,
    setImg2imgStrength: setPersistedImg2imgStrength,
    img2imgEnablePromptExpansion: persistedImg2imgEnablePromptExpansion,
    setImg2imgEnablePromptExpansion: setPersistedImg2imgEnablePromptExpansion,
    img2imgPrompt: persistedImg2imgPrompt,
    setImg2imgPrompt: setPersistedImg2imgPrompt,
    img2imgPromptHasBeenSet: persistedImg2imgPromptHasBeenSet,
    editModeLoRAs,
    createAsGeneration,
    setCreateAsGeneration,
    advancedSettings,
    setAdvancedSettings,
    qwenEditModel,
    setQwenEditModel,
    editMode: persistedEditMode,
    setEditMode: setPersistedEditMode,
    panelMode: persistedPanelMode,
    isReady: isEditSettingsReady,
    hasPersistedSettings,
  } = editSettingsPersistence;

  // ========================================
  // SHARED LIGHTBOX STATE
  // ========================================

  // Navigation handlers (for slot-based navigation in segment mode)
  const handleSlotNavNext = useCallback(() => {
    if (onNext) onNext();
  }, [onNext]);

  const handleSlotNavPrev = useCallback(() => {
    if (onPrevious) onPrevious();
  }, [onPrevious]);

  // STATE SYNC PATTERN NOTE:
  // useSharedLightboxState needs isInpaintMode/isMagicEditMode for layout calculations,
  // but these come from hooks called AFTER useSharedLightboxState.
  // We use local state as a proxy, updated via useEffect after the hooks run.
  // This causes a one-frame delay but is acceptable for swipe/layout calculations.
  // TODO (Phase 5): Consider restructuring to avoid this sync pattern.
  const [isInpaintModeLocal, setIsInpaintModeLocal] = useState(false);
  const [isMagicEditModeLocal, setIsMagicEditModeLocal] = useState(false);

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
    showNavigation,
    hasNext,
    hasPrevious,
    handleSlotNavNext,
    handleSlotNavPrev,
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
    starred,
    onOpenExternalGeneration,
    showTaskDetails,
    isSpecialEditMode: isMagicEditModeLocal,
    isInpaintMode: isInpaintModeLocal,
    isMagicEditMode: isMagicEditModeLocal,
    isCloudMode,
    showDownload,
    isDownloading,
    setIsDownloading,
    onDelete,
    isDeleting,
    isUpscaling,
    isPendingUpscale,
    hasUpscaledVersion,
    showingUpscaled,
    handleUpscale,
    handleToggleUpscaled,
    handleEnterMagicEditMode: () => {}, // Will be replaced after hook
    effectiveImageUrl,
    imageDimensions: imageDimensions || { width: 1024, height: 1024 },
    projectAspectRatio,
    swipeDisabled: isMagicEditModeLocal || readOnly,
  });

  // Extract shared state
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
    return editModeLoRAs;
  }, [editLoraManager.selectedLoras, editModeLoRAs]);

  // ========================================
  // INPAINTING HOOK
  // ========================================

  const inpaintingHook = useInpainting({
    media,
    selectedProjectId,
    shotId,
    toolTypeOverride,
    isVideo: false,
    imageContainerRef,
    imageDimensions,
    handleExitInpaintMode: () => {},
    loras: effectiveEditModeLoRAs,
    activeVariantId: variants.activeVariant?.id,
    activeVariantLocation: variants.activeVariant?.location,
    createAsGeneration,
    advancedSettings,
    qwenEditModel,
    imageUrl: variants.activeVariant?.location || effectiveImageUrl,
    thumbnailUrl: variants.activeVariant?.thumbnail_url || media.thumbUrl,
    initialEditMode: persistedEditMode,
  });

  const {
    isInpaintMode,
    brushStrokes,
    isEraseMode,
    inpaintPrompt,
    inpaintNumGenerations,
    brushSize,
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isAnnotateMode,
    editMode,
    annotationMode,
    selectedShapeId,
    setIsInpaintMode,
    setIsEraseMode,
    setInpaintPrompt,
    setInpaintNumGenerations,
    setBrushSize,
    setIsAnnotateMode,
    setEditMode,
    setAnnotationMode,
    handleUndo,
    handleClearMask,
    handleEnterInpaintMode,
    handleGenerateInpaint,
    handleGenerateAnnotatedEdit,
    handleDeleteSelected,
    handleToggleFreeForm,
    getDeleteButtonPosition,
    onStrokeComplete,
    onStrokesChange,
    onSelectionChange,
    onTextModeHint,
    strokeOverlayRef,
  } = inpaintingHook;

  // ========================================
  // EDIT SETTINGS SYNC
  // ========================================

  useEditSettingsSync({
    actualGenerationId,
    isEditSettingsReady,
    hasPersistedSettings,
    persistedEditMode,
    persistedNumGenerations,
    persistedPrompt,
    editMode,
    inpaintNumGenerations,
    inpaintPrompt,
    setEditMode,
    setInpaintNumGenerations,
    setInpaintPrompt,
    setPersistedEditMode,
    setPersistedNumGenerations,
    setPersistedPrompt,
  });

  const handleExitInpaintMode = () => {
    setIsInpaintMode(false);
  };

  // ========================================
  // MAGIC EDIT MODE HOOK
  // ========================================

  const magicEditHook = useMagicEditMode({
    media,
    selectedProjectId,
    autoEnterInpaint,
    isVideo: false,
    isInpaintMode,
    setIsInpaintMode,
    handleEnterInpaintMode,
    handleGenerateInpaint,
    brushStrokes,
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,
    editModeLoRAs: effectiveEditModeLoRAs,
    sourceUrlForTasks,
    imageDimensions,
    toolTypeOverride,
    isInSceneBoostEnabled: false,
    setIsInSceneBoostEnabled: () => {},
    activeVariantId: variants.activeVariant?.id,
    activeVariantLocation: variants.activeVariant?.location,
    createAsGeneration,
    advancedSettings,
    qwenEditModel,
    enabled: true,
  });

  const {
    isMagicEditMode,
    setIsMagicEditMode,
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
    inpaintPanelPosition,
    setInpaintPanelPosition,
    handleEnterMagicEditMode,
    handleExitMagicEditMode,
    handleUnifiedGenerate,
    isSpecialEditMode,
  } = magicEditHook;

  // Sync edit mode state to shared state hook (see STATE SYNC PATTERN NOTE above)
  // This runs after useMagicEditMode provides the real values
  useEffect(() => {
    setIsInpaintModeLocal(isInpaintMode);
    setIsMagicEditModeLocal(isMagicEditMode);
  }, [isInpaintMode, isMagicEditMode]);

  // ========================================
  // REPOSITION MODE HOOK
  // ========================================

  const repositionHook = useRepositionMode({
    media,
    selectedProjectId,
    imageDimensions,
    imageContainerRef,
    loras: effectiveEditModeLoRAs,
    inpaintPrompt,
    inpaintNumGenerations,
    toolTypeOverride,
    shotId,
    onVariantCreated: variants.setActiveVariantId,
    refetchVariants: variants.refetch,
    createAsGeneration,
    advancedSettings,
    activeVariantLocation: variants.activeVariant?.location,
    activeVariantId: variants.activeVariant?.id,
    activeVariantParams: variants.activeVariant?.params as Record<string, unknown> | null,
    qwenEditModel,
  });

  const {
    transform: repositionTransform,
    hasTransformChanges,
    isGeneratingReposition,
    repositionGenerateSuccess,
    isSavingAsVariant,
    saveAsVariantSuccess,
    setTranslateX,
    setTranslateY,
    setScale,
    setRotation,
    toggleFlipH,
    toggleFlipV,
    resetTransform,
    handleGenerateReposition,
    handleSaveAsVariant,
    getTransformStyle,
    isDragging: isRepositionDragging,
    dragHandlers: repositionDragHandlers,
  } = repositionHook;

  // ========================================
  // IMG2IMG MODE HOOK
  // ========================================

  const img2imgHook = useImg2ImgMode({
    media,
    selectedProjectId,
    isVideo: false,
    sourceUrlForTasks,
    toolTypeOverride,
    createAsGeneration,
    availableLoras,
    img2imgStrength: persistedImg2imgStrength,
    setImg2imgStrength: setPersistedImg2imgStrength,
    enablePromptExpansion: persistedImg2imgEnablePromptExpansion,
    setEnablePromptExpansion: setPersistedImg2imgEnablePromptExpansion,
    img2imgPrompt: persistedImg2imgPrompt,
    setImg2imgPrompt: setPersistedImg2imgPrompt,
    img2imgPromptHasBeenSet: persistedImg2imgPromptHasBeenSet,
    numGenerations: persistedNumGenerations,
    activeVariantLocation: variants.activeVariant?.location,
    activeVariantId: variants.activeVariant?.id,
    shotId,
  });

  const {
    img2imgPrompt,
    img2imgStrength,
    enablePromptExpansion,
    isGeneratingImg2Img,
    img2imgGenerateSuccess,
    setImg2imgPrompt,
    setImg2imgStrength,
    setEnablePromptExpansion,
    handleGenerateImg2Img,
    loraManager: img2imgLoraManager,
  } = img2imgHook;

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
    persistedPanelMode,
    isVideo: false,
    isSpecialEditMode,
    isInVideoEditMode: false,
    initialVideoTrimMode: false,
    autoEnterInpaint,
    handleEnterVideoEditMode: () => {},
    handleEnterMagicEditMode,
  });

  // ========================================
  // PENDING TASKS
  // ========================================

  const { pendingCount: pendingTaskCount } = usePendingGenerationTasks(actualGenerationId, selectedProjectId);

  const unviewedVariantCount = useMemo(() => {
    if (!variants.list || variants.list.length === 0) return 0;
    return variants.list.filter((v) => v.viewed_at === null).length;
  }, [variants.list]);

  const { markAllViewed: markAllViewedMutation } = useMarkVariantViewed();
  const handleMarkAllViewed = useCallback(() => {
    if (variantFetchGenerationId) {
      markAllViewedMutation(variantFetchGenerationId);
    }
  }, [markAllViewedMutation, variantFetchGenerationId]);

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
    isInpaintMode,
    isSpecialEditMode,
    isInVideoEditMode: false,
    editMode,
    setEditMode,
    setIsInpaintMode,
  });

  // Build ImageEditContext value
  const imageEditValue = useMemo<ImageEditState>(() => ({
    // Mode state
    isInpaintMode,
    isMagicEditMode,
    isSpecialEditMode,
    editMode: editMode as ImageEditState['editMode'],

    // Mode setters
    setIsInpaintMode,
    setIsMagicEditMode,
    setEditMode: setEditMode as ImageEditState['setEditMode'],

    // Mode entry/exit handlers
    handleEnterInpaintMode,
    handleExitInpaintMode,
    handleEnterMagicEditMode,
    handleExitMagicEditMode,

    // Brush/Inpaint state
    brushSize,
    setBrushSize,
    isEraseMode,
    setIsEraseMode,
    brushStrokes,

    // Annotation state
    isAnnotateMode,
    setIsAnnotateMode,
    annotationMode,
    setAnnotationMode,
    selectedShapeId,

    // Undo/Clear
    handleUndo,
    handleClearMask,

    // Reposition state (read-only values)
    repositionTransform,
    hasTransformChanges,
    isGeneratingReposition,
    repositionGenerateSuccess,
    isSavingAsVariant,
    saveAsVariantSuccess,

    // Panel UI state
    inpaintPanelPosition,
    setInpaintPanelPosition,
  }), [
    // Mode state
    isInpaintMode,
    isMagicEditMode,
    isSpecialEditMode,
    editMode,
    // Mode setters
    setIsInpaintMode,
    setIsMagicEditMode,
    setEditMode,
    // Mode handlers
    handleEnterInpaintMode,
    handleExitInpaintMode,
    handleEnterMagicEditMode,
    handleExitMagicEditMode,
    // Brush/Inpaint
    brushSize,
    setBrushSize,
    isEraseMode,
    setIsEraseMode,
    brushStrokes,
    // Annotation
    isAnnotateMode,
    setIsAnnotateMode,
    annotationMode,
    setAnnotationMode,
    selectedShapeId,
    // Undo/Clear
    handleUndo,
    handleClearMask,
    // Reposition
    repositionTransform,
    hasTransformChanges,
    isGeneratingReposition,
    repositionGenerateSuccess,
    isSavingAsVariant,
    saveAsVariantSuccess,
    // Panel UI
    inpaintPanelPosition,
    setInpaintPanelPosition,
  ]);

  // Build EditFormContext value
  const editFormValue = useMemo<EditFormState>(() => ({
    // Inpaint form
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,

    // Img2Img form
    img2imgPrompt,
    setImg2imgPrompt,
    img2imgStrength,
    setImg2imgStrength,
    enablePromptExpansion,
    setEnablePromptExpansion,

    // LoRA mode
    loraMode,
    setLoraMode,
    customLoraUrl,
    setCustomLoraUrl,

    // Generation options
    createAsGeneration,
    setCreateAsGeneration,

    // Model selection
    qwenEditModel,
    setQwenEditModel,

    // Advanced settings
    advancedSettings,
    setAdvancedSettings,

    // Generation status
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isGeneratingImg2Img,
    img2imgGenerateSuccess,
    isGeneratingReposition,
    repositionGenerateSuccess,
    isSavingAsVariant,
    saveAsVariantSuccess,
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
  }), [
    // Inpaint form
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,
    // Img2Img form
    img2imgPrompt,
    setImg2imgPrompt,
    img2imgStrength,
    setImg2imgStrength,
    enablePromptExpansion,
    setEnablePromptExpansion,
    // LoRA mode
    loraMode,
    setLoraMode,
    customLoraUrl,
    setCustomLoraUrl,
    // Generation options
    createAsGeneration,
    setCreateAsGeneration,
    // Model selection
    qwenEditModel,
    setQwenEditModel,
    // Advanced settings
    advancedSettings,
    setAdvancedSettings,
    // Generation status
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isGeneratingImg2Img,
    img2imgGenerateSuccess,
    isGeneratingReposition,
    repositionGenerateSuccess,
    isSavingAsVariant,
    saveAsVariantSuccess,
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
  ]);

  // ========================================
  // DOWNLOAD HANDLER
  // ========================================

  const handleDownload = async () => {
    let urlToDownload: string | undefined;
    const intendedVariantId = intendedActiveVariantIdRef.current;

    if (intendedVariantId && variants.list.length > 0) {
      const intendedVariant = variants.list.find((v) => v.id === intendedVariantId);
      if (intendedVariant?.location) {
        urlToDownload = intendedVariant.location;
      }
    }

    if (!urlToDownload) {
      urlToDownload = effectiveMedia.mediaUrl;
    }

    if (!urlToDownload) return;

    setIsDownloading(true);
    try {
      const segmentOverrides = readSegmentOverrides(media.metadata as Record<string, unknown> | null);
      const prompt = media.params?.prompt ||
                     (media.metadata as Record<string, unknown> | undefined)?.enhanced_prompt as string | undefined ||
                     segmentOverrides.prompt ||
                     (media.metadata as Record<string, unknown> | undefined)?.prompt as string | undefined;
      await downloadMedia(urlToDownload, media.id, false, media.contentType, prompt);
    } finally {
      setIsDownloading(false);
    }
  };

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

  // Always fullscreen so click-to-close on content background works the same
  // as videos (where DesktopSidePanelLayout handles it). Without fullscreen,
  // the Popup is w-auto/h-auto and the dark area is the Backdrop, which has
  // a broken click path due to preventDefault on pointerdown killing click events.
  const needsFullscreenLayout = true;
  // Check both effectiveTasksPaneOpen AND isTasksPaneLocked as a defensive measure
  // in case they're temporarily out of sync (e.g., during hydration)
  const needsTasksPaneOffset = needsFullscreenLayout && (effectiveTasksPaneOpen || isTasksPaneLocked) && !layout.isPortraitMode && layout.isTabletOrLarger;

  const accessibilityTitle = `Image Lightbox - ${media?.id?.substring(0, 8)}`;
  const accessibilityDescription = 'View and interact with image in full screen. Use arrow keys to navigate, Escape to close.';

  // Generation name (stubbed)
  const generationName = media?.name || '';
  const isEditingGenerationName = false;
  const setIsEditingGenerationName = (_: boolean) => {};
  const handleGenerationNameChange = (_: string) => {};

  // Flip functionality removed
  const isFlippedHorizontally = false;
  const isSaving = false;

  // ========================================
  // SHOW PANEL DECISION
  // ========================================
  // showPanel = true when the controls panel should render (desktop side panel or mobile stacked)
  const showPanel = layout.shouldShowSidePanel || ((showTaskDetails || isSpecialEditMode) && isMobile);

  // ========================================
  // BUILD LAYOUT PROPS (via hook)
  // ========================================

  const { layoutProps } = useLightboxLayoutProps({
    showPanel,
    shouldShowSidePanel: layout.shouldShowSidePanel,
    // Core
    onClose,
    readOnly,
    selectedProjectId,
    isMobile,
    actualGenerationId,
    // Media
    media,
    isVideo: false,
    effectiveMediaUrl: effectiveMedia.mediaUrl,
    effectiveVideoUrl: '',
    imageDimensions,
    setImageDimensions,
    // Variants
    variants: variants.list,
    activeVariant: variants.activeVariant,
    primaryVariant: variants.primaryVariant,
    isLoadingVariants: variants.isLoading,
    setActiveVariantId: variants.setActiveVariantId,
    setPrimaryVariant: variants.setPrimaryVariant,
    deleteVariant: variants.deleteVariant,
    promoteSuccess: variants.promoteSuccess,
    isPromoting: variants.isPromoting,
    handlePromoteToGeneration: variants.handlePromoteToGeneration,
    isMakingMainVariant: makeMainVariant.isMaking,
    canMakeMainVariant: makeMainVariant.canMake,
    handleMakeMainVariant: makeMainVariant.handle,
    variantParamsToLoad,
    setVariantParamsToLoad,
    variantsSectionRef,
    // Video edit (stubs for images)
    isVideoTrimModeActive: false,
    isVideoEditModeActive: false,
    isInVideoEditMode: false,
    trimVideoRef: { current: null },
    trimState: { startTrim: 0, endTrim: 0, videoDuration: 0 },
    setStartTrim: () => {},
    setEndTrim: () => {},
    resetTrim: () => {},
    trimmedDuration: 0,
    hasTrimChanges: false,
    saveTrimmedVideo: async () => {},
    isSavingTrim: false,
    trimSaveProgress: 0,
    trimSaveError: null,
    trimSaveSuccess: false,
    setVideoDuration: () => {},
    setTrimCurrentTime: () => {},
    trimCurrentTime: 0,
    videoEditing: null,
    handleEnterVideoTrimMode: () => {},
    handleEnterVideoReplaceMode: () => {},
    handleEnterVideoRegenerateMode: () => {},
    handleEnterVideoEnhanceMode: () => {},
    handleExitVideoEditMode: () => {},
    handleEnterVideoEditMode: () => {},
    regenerateFormProps: null,
    isCloudMode,
    enhanceSettings: { enableInterpolation: false, enableUpscale: true, numFrames: 1, upscaleFactor: 2, colorFix: true, outputQuality: 'high' as const },
    onUpdateEnhanceSetting: () => {},
    onEnhanceGenerate: () => {},
    isEnhancing: false,
    enhanceSuccess: false,
    canEnhance: false,
    // Image upscale
    handleUpscale,
    isUpscaling,
    upscaleSuccess,
    // Edit mode
    isInpaintMode,
    isAnnotateMode,
    isSpecialEditMode,
    editMode,
    setEditMode,
    setIsInpaintMode,
    brushStrokes,
    isEraseMode,
    setIsEraseMode,
    brushSize,
    setBrushSize,
    annotationMode,
    setAnnotationMode,
    selectedShapeId,
    onStrokeComplete,
    onStrokesChange,
    onSelectionChange,
    onTextModeHint,
    strokeOverlayRef,
    handleUndo,
    handleClearMask,
    getDeleteButtonPosition,
    handleToggleFreeForm,
    handleDeleteSelected,
    isRepositionDragging,
    repositionDragHandlers,
    getTransformStyle,
    repositionTransform,
    setTranslateX,
    setTranslateY,
    setScale,
    setRotation,
    toggleFlipH,
    toggleFlipV,
    resetTransform,
    imageContainerRef,
    isFlippedHorizontally,
    isSaving,
    handleExitInpaintMode,
    inpaintPanelPosition,
    setInpaintPanelPosition,
    // Edit form props
    inpaintPrompt,
    setInpaintPrompt,
    inpaintNumGenerations,
    setInpaintNumGenerations,
    loraMode,
    setLoraMode,
    customLoraUrl,
    setCustomLoraUrl,
    isGeneratingInpaint,
    inpaintGenerateSuccess,
    isCreatingMagicEditTasks,
    magicEditTasksCreated,
    handleExitMagicEditMode,
    handleUnifiedGenerate,
    handleGenerateAnnotatedEdit,
    handleGenerateReposition,
    isGeneratingReposition,
    repositionGenerateSuccess,
    hasTransformChanges,
    handleSaveAsVariant,
    isSavingAsVariant,
    saveAsVariantSuccess,
    createAsGeneration,
    setCreateAsGeneration,
    // Img2Img props
    img2imgPrompt,
    setImg2imgPrompt,
    img2imgStrength,
    setImg2imgStrength,
    enablePromptExpansion,
    setEnablePromptExpansion,
    isGeneratingImg2Img,
    img2imgGenerateSuccess,
    handleGenerateImg2Img,
    img2imgLoraManager,
    availableLoras,
    editLoraManager,
    advancedSettings,
    setAdvancedSettings,
    isLocalGeneration,
    qwenEditModel,
    setQwenEditModel,
    // Info panel props
    showImageEditTools,
    adjustedTaskDetailsData,
    generationName,
    handleGenerationNameChange,
    isEditingGenerationName,
    setIsEditingGenerationName,
    derivedItems: lineage.derivedItems,
    derivedGenerations: lineage.derivedGenerations,
    paginatedDerived: lineage.paginatedDerived,
    derivedPage: lineage.derivedPage,
    derivedTotalPages: lineage.derivedTotalPages,
    setDerivedPage: lineage.setDerivedPage,
    replaceImages,
    setReplaceImages,
    sourceGenerationData: sourceGeneration.data,
    sourcePrimaryVariant: sourceGeneration.primaryVariant,
    onOpenExternalGeneration,
    // Navigation
    showNavigation,
    hasNext,
    hasPrevious,
    handleSlotNavNext,
    handleSlotNavPrev,
    swipeNavigation: navigation.swipeNavigation,
    // Panel
    effectiveTasksPaneOpen,
    effectiveTasksPaneWidth,
    // Button group props - override topRight with real handlers (not placeholders)
    buttonGroupProps: {
      ...buttonGroupProps,
      topRight: {
        ...buttonGroupProps.topRight,
        handleDownload,
        handleDelete,
      },
    },
    // Workflow props
    allShots: allShots || [],
    selectedShotId,
    shotId,
    onAddToShot,
    onAddToShotWithoutPosition,
    onDelete,
    onApplySettings,
    onShotChange,
    onCreateShot,
    showTickForImageId,
    showTickForSecondaryImageId,
    onShowTick,
    onShowSecondaryTick,
    onOptimisticPositioned,
    onOptimisticUnpositioned,
    isAlreadyPositionedInSelectedShot: shots.isAlreadyPositionedInSelectedShot,
    isAlreadyAssociatedWithoutPosition: shots.isAlreadyAssociatedWithoutPosition,
    contentRef,
    handleApplySettings,
    handleNavigateToShotFromSelector,
    handleAddVariantAsNewGenerationToShot: variants.handleAddVariantAsNewGenerationToShot,
    handleReplaceInShot: async () => {},
    isDeleting,
    handleDelete,
    // Adjacent segments
    adjacentSegments,
    // Segment slot mode
    segmentSlotMode: undefined,
  });

  // ========================================
  // RENDER
  // ========================================

  return (
    <LightboxProviders stateValue={lightboxStateValue}>
      <ImageEditProvider value={imageEditValue}>
        <EditFormProvider value={editFormValue}>
          <LightboxShell
            onClose={onClose}
            hasCanvasOverlay={isInpaintMode}
            isRepositionMode={isInpaintMode && editMode === 'reposition'}
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
            <LightboxLayout {...layoutProps} />
          </LightboxShell>
        </EditFormProvider>
      </ImageEditProvider>
    </LightboxProviders>
  );
};
