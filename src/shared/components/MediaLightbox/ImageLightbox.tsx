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
  useLightboxWorkflowProps,
  useLightboxVariantBadges,
} from './hooks';

// Import components
import { LightboxShell, LightboxProviders } from './components';
import { LightboxLayout } from './components/layouts';
import { EditModePanel } from './components/EditModePanel';
import { InfoPanel } from './components/InfoPanel';
import { ImageEditProvider, type ImageEditState } from './contexts/ImageEditContext';

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
  const [_variantParamsToLoad, setVariantParamsToLoad] = useState<Record<string, unknown> | null>(null);

  // Compute actual generation ID
  // For timeline images, media.id is shot_generations.id, not the generation ID
  // So we need to prefer media.generation_id for variant fetching
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

  // useSharedLightboxState needs isInpaintMode/isMagicEditMode for layout calculations,
  // but these come from hooks called AFTER it. Local state proxies are updated via
  // useEffect below — one-frame delay is acceptable for swipe/layout calculations.
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
    starred,
    onOpenExternalGeneration,
    showNavigation,
    hasNext,
    hasPrevious,
    handleSlotNavNext,
    handleSlotNavPrev,
    swipeDisabled: isMagicEditModeLocal || readOnly,
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
    handleUpscale,
    handleEnterMagicEditMode: () => {}, // Will be replaced after hook
    effectiveImageUrl,
    imageDimensions: imageDimensions || { width: 1024, height: 1024 },
    projectAspectRatio,
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
    sourceUrlForTasks: effectiveImageUrl,
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
    sourceUrlForTasks: effectiveImageUrl,
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

  // Placeholder values for context fields not yet wired to real state
  const isFlippedHorizontally = false;
  const isSaving = false;

  // Build ImageEditContext value (unified: mode + form + generation status)
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

    // Canvas interaction
    onStrokeComplete,
    onStrokesChange,
    onSelectionChange,
    onTextModeHint,
    strokeOverlayRef,
    getDeleteButtonPosition,
    handleToggleFreeForm,
    handleDeleteSelected,

    // Reposition state + interaction handlers
    repositionTransform,
    hasTransformChanges,
    isRepositionDragging,
    repositionDragHandlers,
    getTransformStyle,
    setScale,
    setRotation,
    toggleFlipH,
    toggleFlipV,
    resetTransform,

    // Display refs
    imageContainerRef,
    isFlippedHorizontally,
    isSaving,

    // Panel UI state
    inpaintPanelPosition,
    setInpaintPanelPosition,

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
    isInpaintMode, isMagicEditMode, isSpecialEditMode, editMode,
    setIsInpaintMode, setIsMagicEditMode, setEditMode,
    handleEnterInpaintMode, handleExitInpaintMode, handleEnterMagicEditMode, handleExitMagicEditMode,
    brushSize, setBrushSize, isEraseMode, setIsEraseMode, brushStrokes,
    isAnnotateMode, setIsAnnotateMode, annotationMode, setAnnotationMode, selectedShapeId,
    handleUndo, handleClearMask,
    onStrokeComplete, onStrokesChange, onSelectionChange, onTextModeHint, strokeOverlayRef,
    getDeleteButtonPosition, handleToggleFreeForm, handleDeleteSelected,
    repositionTransform, hasTransformChanges, isRepositionDragging, repositionDragHandlers,
    getTransformStyle, setScale, setRotation, toggleFlipH, toggleFlipV, resetTransform,
    imageContainerRef, isFlippedHorizontally, isSaving,
    inpaintPanelPosition, setInpaintPanelPosition,
    inpaintPrompt, setInpaintPrompt, inpaintNumGenerations, setInpaintNumGenerations,
    img2imgPrompt, setImg2imgPrompt, img2imgStrength, setImg2imgStrength,
    enablePromptExpansion, setEnablePromptExpansion,
    loraMode, setLoraMode, customLoraUrl, setCustomLoraUrl,
    createAsGeneration, setCreateAsGeneration, qwenEditModel, setQwenEditModel,
    advancedSettings, setAdvancedSettings,
    isGeneratingInpaint, inpaintGenerateSuccess, isGeneratingImg2Img, img2imgGenerateSuccess,
    isGeneratingReposition, repositionGenerateSuccess, isSavingAsVariant, saveAsVariantSuccess,
    isCreatingMagicEditTasks, magicEditTasksCreated,
  ]);

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

  // ========================================
  // SHOW PANEL DECISION
  // ========================================
  // showPanel = true when the controls panel should render (desktop side panel or mobile stacked)
  const showPanel = layout.shouldShowSidePanel || ((showTaskDetails || isSpecialEditMode) && isMobile);

  // ========================================
  // BUILD CONTROLS PANEL PROPS (local — only when panel is shown)
  // ========================================

  // Shared props for panel content
  const panelVariant = (layout.shouldShowSidePanel && !isMobile) ? 'desktop' as const : 'mobile' as const;
  const panelTaskId = adjustedTaskDetailsData?.taskId || (media as unknown as Record<string, unknown>)?.source_task_id as string | null || null;

  // Build panel content directly (eliminates ControlsPanel routing + video stubs)
  // ImageLightbox only routes between EditModePanel and InfoPanel
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
          advancedSettings={advancedSettings}
          setAdvancedSettings={setAdvancedSettings}
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
    advancedSettings, setAdvancedSettings, isLocalGeneration,
    showImageEditTools, adjustedTaskDetailsData, lineage.derivedItems,
    lineage.derivedGenerations, lineage.paginatedDerived, lineage.derivedPage,
    lineage.derivedTotalPages, lineage.setDerivedPage, replaceImages, setReplaceImages,
    variants.primaryVariant, variants.setActiveVariantId,
  ]);

  // ========================================
  // BUILD LAYOUT PROPS (via hook — workflow + panel + navigation only)
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
          <LightboxLayout {...layoutProps} controlsPanelContent={controlsPanelContent} />
        </LightboxShell>
      </ImageEditProvider>
    </LightboxProviders>
  );
};
