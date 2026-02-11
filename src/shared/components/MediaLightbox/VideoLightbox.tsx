/**
 * VideoLightbox
 *
 * Specialized lightbox for video media. Handles all video-specific functionality:
 * - Video trimming
 * - Video replace mode
 * - Video regenerate mode
 * - Video enhance mode
 * - Segment slot mode (timeline navigation)
 *
 * Uses useSharedLightboxState for shared functionality (variants, navigation, etc.)
 *
 * This is part of the split architecture where MediaLightbox dispatches to
 * ImageLightbox or VideoLightbox based on media type.
 */

import React, { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import type { GenerationRow, Shot } from '@/types/shots';
import type { SegmentSlotModeData, AdjacentSegmentsData, ShotOption, TaskDetailsData } from './types';

import { useProject } from '@/shared/contexts/ProjectContext';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useTaskStatusCounts } from '@/shared/hooks/useTasks';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { LightboxProviders } from './components';
import { LightboxLayout } from './components/layouts';
import { SegmentSlotFormView } from './components/SegmentSlotFormView';
import { VideoEditPanel } from './components/VideoEditPanel';
import { InfoPanel } from './components/InfoPanel';
import { useIsMobile } from '@/shared/hooks/use-mobile';

// Import hooks
import {
  useEditSettingsPersistence,
  usePanelModeRestore,
  useAdjustedTaskDetails,
  useVideoRegenerateMode,
  useLightboxVideoMode,
  useSharedLightboxState,
  useLightboxStateValue,
  useLightboxWorkflowProps,
  useReplaceInShot,
  useLightboxVariantBadges,
} from './hooks';

// Import components
import { LightboxShell } from './components';
import { VideoEditProvider, type VideoEditState } from './contexts/VideoEditContext';

// Import utils
import { extractDimensionsFromMedia, handleLightboxDownload } from './utils';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';
import { useLoadVariantImages } from '@/shared/hooks/useLoadVariantImages';

// ============================================================================
// Props Interface
// ============================================================================

interface VideoLightboxProps {
  /** Media to display. Optional in segment slot mode when no video exists (form-only). */
  media?: GenerationRow;
  onClose: () => void;
  onNext?: () => void;
  onPrevious?: () => void;
  segmentSlotMode?: SegmentSlotModeData;
  readOnly?: boolean;
  showNavigation?: boolean;
  showDownload?: boolean;
  hasNext?: boolean;
  hasPrevious?: boolean;
  allShots?: ShotOption[];
  selectedShotId?: string;
  onShotChange?: (shotId: string) => void;
  onAddToShot?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onAddToShotWithoutPosition?: (targetShotId: string, generationId: string, imageUrl?: string, thumbUrl?: string) => Promise<boolean>;
  onDelete?: (id: string) => void;
  isDeleting?: string | null;
  onApplySettings?: (metadata: GenerationRow['metadata']) => void;
  showTickForImageId?: string | null;
  onShowTick?: (imageId: string) => void;
  showTickForSecondaryImageId?: string | null;
  onShowSecondaryTick?: (imageId: string) => void;
  starred?: boolean;
  showTaskDetails?: boolean;
  taskDetailsData?: TaskDetailsData;
  onShowTaskDetails?: () => void;
  onCreateShot?: (shotName: string, files: File[]) => Promise<{shotId?: string; shotName?: string} | void>;
  onNavigateToShot?: (shot: Shot, options?: { isNewlyCreated?: boolean }) => void;
  optimisticPositionedIds?: Set<string>;
  optimisticUnpositionedIds?: Set<string>;
  onOptimisticPositioned?: (mediaId: string, shotId: string) => void;
  onOptimisticUnpositioned?: (mediaId: string, shotId: string) => void;
  positionedInSelectedShot?: boolean;
  associatedWithoutPositionInSelectedShot?: boolean;
  onOpenExternalGeneration?: (generationId: string, derivedContext?: string[]) => Promise<void>;
  shotId?: string;
  tasksPaneOpen?: boolean;
  tasksPaneWidth?: number;
  initialVideoTrimMode?: boolean;
  initialVariantId?: string;
  fetchVariantsForSelf?: boolean;
  currentSegmentImages?: {
    startUrl?: string;
    endUrl?: string;
    startGenerationId?: string;
    endGenerationId?: string;
    startShotGenerationId?: string;
    endShotGenerationId?: string;
    activeChildGenerationId?: string;
    startVariantId?: string;
    endVariantId?: string;
  };
  onSegmentFrameCountChange?: (pairShotGenerationId: string, frameCount: number) => void;
  currentFrameCount?: number;
  onTrimModeChange?: (isTrimMode: boolean) => void;
  adjacentSegments?: AdjacentSegmentsData;
}

// ============================================================================
// Component
// ============================================================================

export const VideoLightbox: React.FC<VideoLightboxProps> = (props) => {
  const {
    media,
    onClose,
    onNext,
    onPrevious,
    segmentSlotMode,
    readOnly = false,
    showNavigation = true,
    showDownload = true,
    hasNext: hasNextProp = false,
    hasPrevious: hasPreviousProp = false,
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
    initialVideoTrimMode,
    initialVariantId,
    fetchVariantsForSelf,
    currentSegmentImages,
    onSegmentFrameCountChange,
    currentFrameCount,
    onTrimModeChange,
    adjacentSegments,
  } = props;

  // ========================================
  // SEGMENT SLOT MODE SETUP
  // ========================================

  const isSegmentSlotMode = !!segmentSlotMode;
  const hasSegmentVideo = isSegmentSlotMode && !!segmentSlotMode.segmentVideo;
  const isFormOnlyMode = isSegmentSlotMode && !hasSegmentVideo;

  // Safety check - media is required unless we're in form-only mode
  if (!media && !isFormOnlyMode) {
    console.error('[VideoLightbox] ❌ No media prop provided and not in form-only mode!');
    return null;
  }

  // Navigation in segment slot mode
  const hasNext = isSegmentSlotMode
    ? segmentSlotMode.currentIndex < segmentSlotMode.totalPairs - 1
    : hasNextProp;
  const hasPrevious = isSegmentSlotMode
    ? segmentSlotMode.currentIndex > 0
    : hasPreviousProp;

  const handleSlotNavNext = useCallback(() => {
    if (isSegmentSlotMode) {
      segmentSlotMode.onNavigateToPair(segmentSlotMode.currentIndex + 1);
    } else if (onNext) {
      onNext();
    }
  }, [isSegmentSlotMode, segmentSlotMode, onNext]);

  const handleSlotNavPrev = useCallback(() => {
    if (isSegmentSlotMode) {
      segmentSlotMode.onNavigateToPair(segmentSlotMode.currentIndex - 1);
    } else if (onPrevious) {
      onPrevious();
    }
  }, [isSegmentSlotMode, segmentSlotMode, onPrevious]);

  // ========================================
  // CORE SETUP
  // ========================================

  const isMobile = useIsMobile();
  const { project, selectedProjectId } = useProject();
  const projectAspectRatio = project?.aspect_ratio;
  const { value: generationMethods } = useUserUIState('generationMethods', { onComputer: true, inCloud: true });
  const isCloudMode = generationMethods.inCloud;

  // Panes context for tasks pane
  const {
    isTasksPaneOpen: tasksPaneOpenContext,
    tasksPaneWidth: tasksPaneWidthContext,
    isTasksPaneLocked,
  } = usePanes();

  const effectiveTasksPaneOpen = tasksPaneOpen ?? tasksPaneOpenContext;
  const effectiveTasksPaneWidth = tasksPaneWidth ?? tasksPaneWidthContext;

  useTaskStatusCounts(selectedProjectId);

  // Refs
  const contentRef = useRef<HTMLDivElement>(null);
  const variantsSectionRef = useRef<HTMLDivElement>(null);

  // State
  const [isDownloading, setIsDownloading] = useState(false);
  const [replaceImages, setReplaceImages] = useState(true);
  const [variantParamsToLoad, setVariantParamsToLoad] = useState<Record<string, unknown> | null>(null);

  // Compute actual generation ID
  // For timeline media, media.id is shot_generations.id, not the generation ID
  // So we need to prefer media.generation_id for variant fetching
  const actualGenerationId = getGenerationId(media) || null;
  const variantFetchGenerationId = fetchVariantsForSelf
    ? actualGenerationId
    : (media?.parent_generation_id || actualGenerationId);

  // ========================================
  // VIDEO EDIT SUB-MODE STATE
  // ========================================

  const [videoEditSubMode, setVideoEditSubModeLocal] = useState<'trim' | 'replace' | 'regenerate' | 'enhance' | null>(() => {
    if (initialVideoTrimMode) return 'trim';
    // Check localStorage for persisted mode
    try {
      const projectKey = selectedProjectId ? `lightbox-edit-last-used-${selectedProjectId}` : null;
      const stored = projectKey ? localStorage.getItem(projectKey) : localStorage.getItem('lightbox-edit-last-used-global');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.panelMode === 'edit' && parsed.videoEditSubMode) {
          return parsed.videoEditSubMode;
        }
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    return null;
  });

  // ========================================
  // EDIT SETTINGS PERSISTENCE
  // ========================================

  const editSettingsPersistence = useEditSettingsPersistence({
    generationId: actualGenerationId,
    projectId: selectedProjectId,
    enabled: !isFormOnlyMode,
  });

  const {
    enhanceSettings,
    setEnhanceSettings,
    videoEditSubMode: persistedVideoEditSubMode,
    panelMode: persistedPanelMode,
    setVideoEditSubMode: setPersistedVideoEditSubMode,
    setPanelMode: setPersistedPanelMode,
  } = editSettingsPersistence;

  // Wrapper for setVideoEditSubMode that also persists
  const setVideoEditSubMode = useCallback((mode: 'trim' | 'replace' | 'regenerate' | null) => {
    setVideoEditSubModeLocal(mode);
    if (mode) {
      setPersistedVideoEditSubMode(mode);
    }
  }, [setPersistedVideoEditSubMode]);

  // ========================================
  // IMAGE DIMENSIONS (for video thumbnails)
  // ========================================

  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(() => {
    return media ? extractDimensionsFromMedia(media) : null;
  });

  React.useLayoutEffect(() => {
    if (!media) return;
    const dims = extractDimensionsFromMedia(media);
    if (dims) setImageDimensions(dims);
  }, [media?.id]);

  // Effective URL for video (the video URL, not thumbnail)
  // This is used as fallback in useEffectiveMedia when there's no activeVariant
  const effectiveImageUrl = media?.imageUrl || media?.location || '';

  // ========================================
  // SHARED LIGHTBOX STATE
  // ========================================

  const sharedState = useSharedLightboxState({
    media: media || ({} as GenerationRow), // Provide empty object for form-only mode
    isVideo: true,
    selectedProjectId,
    isMobile,
    isFormOnlyMode,
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
    swipeDisabled: videoEditSubMode !== null || readOnly,
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
    isSpecialEditMode: videoEditSubMode !== null,
    isInpaintMode: false,
    isMagicEditMode: false,
    isCloudMode,
    showDownload,
    isDownloading,
    setIsDownloading,
    onDelete,
    isDeleting,
    // Upscale is image-only, but button group needs these
    isUpscaling: false,
    isPendingUpscale: false,
    hasUpscaledVersion: false,
    showingUpscaled: false,
    handleUpscale: () => {},
    handleToggleUpscaled: () => {},
    handleEnterMagicEditMode: () => {},
    effectiveImageUrl,
    imageDimensions: imageDimensions || { width: 1024, height: 576 },
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
  // VIDEO REGENERATE MODE
  // ========================================

  const { canRegenerate, regenerateFormProps } = useVideoRegenerateMode({
    isVideo: true,
    media: media || ({} as GenerationRow),
    shotId,
    selectedProjectId,
    actualGenerationId,
    adjustedTaskDetailsData,
    primaryVariant: variants.primaryVariant,
    currentSegmentImages,
    segmentSlotMode,
    variantParamsToLoad,
    setVariantParamsToLoad,
    onSegmentFrameCountChange: segmentSlotMode?.onFrameCountChange ?? onSegmentFrameCountChange,
    currentFrameCount,
  });

  // ========================================
  // VIDEO MODE HOOK (consolidated)
  // ========================================

  const videoMode = useLightboxVideoMode({
    media: media || ({} as GenerationRow),
    isVideo: true,
    selectedProjectId,
    projectAspectRatio,
    shotId,
    actualGenerationId,
    effectiveVideoUrl: effectiveMedia.videoUrl,
    activeVariant: variants.activeVariant,
    setActiveVariantId: variants.setActiveVariantId,
    refetchVariants: variants.refetch,
    videoEditSubMode,
    setVideoEditSubMode,
    persistedVideoEditSubMode,
    setPersistedPanelMode,
    enhanceSettings,
    setEnhanceSettings,
    onTrimModeChange,
    canRegenerate,
  });

  const {
    trimVideoRef,
    trimState,
    trimCurrentTime,
    setTrimCurrentTime,
    trimmedDuration,
    hasTrimChanges,
    setStartTrim,
    setEndTrim,
    resetTrim,
    setVideoDuration,
    isSavingTrim,
    trimSaveProgress,
    trimSaveError,
    trimSaveSuccess,
    saveTrimmedVideo,
    videoEditing,
    videoEnhance,
    handleEnterVideoEditMode,
    handleExitVideoEditMode,
    handleEnterVideoTrimMode,
    handleEnterVideoReplaceMode,
    handleEnterVideoRegenerateMode,
    handleEnterVideoEnhanceMode,
    isInVideoEditMode,
    isVideoTrimModeActive,
    isVideoEditModeActive,
  } = videoMode;

  // ========================================
  // PANEL MODE RESTORE
  // ========================================

  usePanelModeRestore({
    mediaId: media?.id || '',
    persistedPanelMode,
    isVideo: true,
    isSpecialEditMode: false, // Videos don't have image edit modes
    isInVideoEditMode,
    initialVideoTrimMode,
    autoEnterInpaint: false,
    handleEnterVideoEditMode,
    handleEnterMagicEditMode: () => {},
  });

  // ========================================
  // LOAD VARIANT SETTINGS FOR VIDEO
  // ========================================

  useEffect(() => {
    if (!variantParamsToLoad || isFormOnlyMode) return;

    const taskType = variantParamsToLoad.task_type || variantParamsToLoad.created_from;

    if (taskType === 'video_enhance') {
      handleEnterVideoEnhanceMode();
      setEnhanceSettings({
        enableInterpolation: variantParamsToLoad.enable_interpolation ?? false,
        enableUpscale: variantParamsToLoad.enable_upscale ?? true,
        numFrames: variantParamsToLoad.num_frames ?? 1,
        upscaleFactor: variantParamsToLoad.upscale_factor ?? 2,
        colorFix: variantParamsToLoad.color_fix ?? true,
        outputQuality: variantParamsToLoad.output_quality ?? 'high',
      });
      setVariantParamsToLoad(null);
    } else {
      // Travel segment variant - switch to regenerate mode
      handleEnterVideoRegenerateMode();
    }
  }, [
    variantParamsToLoad,
    isFormOnlyMode,
    handleEnterVideoEnhanceMode,
    handleEnterVideoRegenerateMode,
    setEnhanceSettings,
    setVariantParamsToLoad,
  ]);

  // ========================================
  // PENDING TASKS & VARIANT BADGES
  // ========================================

  const { pendingTaskCount, unviewedVariantCount, handleMarkAllViewed } = useLightboxVariantBadges({
    pendingTaskGenerationId: regenerateFormProps?.pairShotGenerationId || actualGenerationId,
    selectedProjectId,
    variants: variants.list,
    variantFetchGenerationId,
  });

  // ========================================
  // LOAD VARIANT IMAGES
  // ========================================

  // Build currentSegmentImages for variant comparison
  // In segment slot mode, use pairData from timeline; otherwise use the prop
  const variantSegmentImages = useMemo(() => {
    if (segmentSlotMode?.pairData) {
      return {
        startUrl: segmentSlotMode.pairData.startImage?.url,
        endUrl: segmentSlotMode.pairData.endImage?.url,
        startGenerationId: segmentSlotMode.pairData.startImage?.generationId,
        endGenerationId: segmentSlotMode.pairData.endImage?.generationId,
        startShotGenerationId: segmentSlotMode.pairData.startImage?.id,
        endShotGenerationId: segmentSlotMode.pairData.endImage?.id,
        startVariantId: segmentSlotMode.pairData.startImage?.primaryVariantId,
        endVariantId: segmentSlotMode.pairData.endImage?.primaryVariantId,
      };
    }
    return currentSegmentImages;
  }, [segmentSlotMode?.pairData, currentSegmentImages]);

  const { loadVariantImages } = useLoadVariantImages({
    currentSegmentImages: variantSegmentImages,
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
    media: media || ({} as GenerationRow),
    isVideo: true,
    effectiveMediaUrl: effectiveMedia.mediaUrl,
    effectiveVideoUrl: effectiveMedia.videoUrl,
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
    onLoadVariantImages: variantSegmentImages ? loadVariantImages : undefined,
    currentSegmentImages: variantSegmentImages,
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

  // Build VideoEditContext value
  const videoEditValue = useMemo<VideoEditState>(() => ({
    // Mode state
    isInVideoEditMode,
    videoEditSubMode,
    isVideoTrimModeActive,
    isVideoEditModeActive,

    // Mode setters
    setVideoEditSubMode,

    // Mode entry/exit handlers
    handleEnterVideoEditMode,
    handleExitVideoEditMode,
    handleEnterVideoTrimMode,
    handleEnterVideoReplaceMode,
    handleEnterVideoRegenerateMode,
    handleEnterVideoEnhanceMode,

    // Trim state
    trimState,
    setStartTrim,
    setEndTrim,
    resetTrim,
    trimmedDuration,
    hasTrimChanges,

    // Video duration/playback
    videoDuration: trimState.videoDuration,
    setVideoDuration,
    trimCurrentTime,
    setTrimCurrentTime,

    // Refs & managers
    trimVideoRef,
    videoEditing,

    // Enhance settings
    enhanceSettings: videoEnhance.settings,
    updateEnhanceSetting: videoEnhance.updateSetting,
  }), [
    // Mode state
    isInVideoEditMode,
    videoEditSubMode,
    isVideoTrimModeActive,
    isVideoEditModeActive,
    // Mode setters
    setVideoEditSubMode,
    // Mode handlers
    handleEnterVideoEditMode,
    handleExitVideoEditMode,
    handleEnterVideoTrimMode,
    handleEnterVideoReplaceMode,
    handleEnterVideoRegenerateMode,
    handleEnterVideoEnhanceMode,
    // Trim state
    trimState,
    setStartTrim,
    setEndTrim,
    resetTrim,
    trimmedDuration,
    hasTrimChanges,
    // Duration/playback
    setVideoDuration,
    trimCurrentTime,
    setTrimCurrentTime,
    // Refs & managers
    trimVideoRef,
    videoEditing,
    // Enhance
    videoEnhance.settings,
    videoEnhance.updateSetting,
  ]);

  // ========================================
  // HANDLERS
  // ========================================

  const handleDownload = () => {
    if (!media) return;
    return handleLightboxDownload({
      intendedVariantId: intendedActiveVariantIdRef.current,
      variants: variants.list,
      fallbackUrl: effectiveMedia.videoUrl,
      media,
      isVideo: true,
      setIsDownloading,
    });
  };

  const handleDelete = () => {
    if (onDelete && media) onDelete(media.id);
  };

  const handleApplySettings = () => {
    if (onApplySettings && media) onApplySettings(media.metadata);
  };

  const handleNavigateToShotFromSelector = useCallback((shot: { id: string; name: string }) => {
    if (onNavigateToShot) {
      const minimalShot = { id: shot.id, name: shot.name, images: [], position: 0 };
      onClose();
      onNavigateToShot(minimalShot);
    }
  }, [onNavigateToShot, onClose]);

  const { handleReplaceInShot } = useReplaceInShot({ onClose });

  // ========================================
  // LAYOUT DECISIONS
  // ========================================

  const isAnyVideoEditMode = isVideoTrimModeActive || isVideoEditModeActive;
  const shouldShowSidePanelWithTrim = layout.shouldShowSidePanel || ((!layout.isPortraitMode && layout.isTabletOrLarger) && isAnyVideoEditMode);
  // showPanel = true when the controls panel should render (desktop side panel or mobile stacked)
  const showPanel = shouldShowSidePanelWithTrim || ((showTaskDetails || isAnyVideoEditMode || (isSegmentSlotMode && hasSegmentVideo)) && isMobile);
  const needsFullscreenLayout = isMobile || isFormOnlyMode || layout.shouldShowSidePanel || shouldShowSidePanelWithTrim;
  // Check both effectiveTasksPaneOpen AND isTasksPaneLocked as a defensive measure
  // in case they're temporarily out of sync (e.g., during hydration)
  const needsTasksPaneOffset = needsFullscreenLayout && (effectiveTasksPaneOpen || isTasksPaneLocked) && !layout.isPortraitMode && layout.isTabletOrLarger;

  const accessibilityTitle = isFormOnlyMode
    ? `Segment ${(segmentSlotMode?.currentIndex ?? 0) + 1} Settings`
    : `Video Lightbox - ${media?.id?.substring(0, 8)}`;

  const accessibilityDescription = isFormOnlyMode
    ? 'Configure and generate this video segment. Use Tab or arrow keys to navigate between segments.'
    : 'View and interact with video in full screen. Use arrow keys to navigate, Escape to close.';

  // ========================================
  // BUILD CONTROLS PANEL PROPS (local — only when panel is shown)
  // ========================================

  // Shared props for panel content
  const panelVariant = (shouldShowSidePanelWithTrim && !isMobile) ? 'desktop' as const : 'mobile' as const;
  const panelTaskId = adjustedTaskDetailsData?.taskId || (media as unknown as Record<string, unknown>)?.source_task_id as string | null || null;

  // Build panel content directly (eliminates ControlsPanel routing + 88-prop interface)
  // VideoLightbox only routes between VideoEditPanel and InfoPanel
  const controlsPanelContent = useMemo(() => {
    if (!showPanel) return undefined;

    if (isInVideoEditMode && videoEditSubMode) {
      return (
        <VideoEditPanel
          variant={panelVariant}
          isCloudMode={isCloudMode}
          trimState={trimState}
          onStartTrimChange={setStartTrim}
          onEndTrimChange={setEndTrim}
          onResetTrim={resetTrim}
          trimmedDuration={trimmedDuration}
          hasTrimChanges={hasTrimChanges}
          onSaveTrim={saveTrimmedVideo}
          isSavingTrim={isSavingTrim}
          trimSaveProgress={trimSaveProgress}
          trimSaveError={trimSaveError}
          trimSaveSuccess={trimSaveSuccess}
          videoUrl={effectiveMedia.videoUrl}
          trimCurrentTime={trimCurrentTime}
          trimVideoRef={trimVideoRef}
          videoEditing={videoEditing}
          projectId={selectedProjectId}
          regenerateFormProps={regenerateFormProps}
          enhanceSettings={videoEnhance.settings}
          onUpdateEnhanceSetting={videoEnhance.updateSetting}
          onEnhanceGenerate={videoEnhance.handleGenerate}
          isEnhancing={videoEnhance.isGenerating}
          enhanceSuccess={videoEnhance.generateSuccess}
          canEnhance={videoEnhance.canSubmit}
          taskId={panelTaskId}
        />
      );
    }

    return (
      <InfoPanel
        variant={panelVariant}
        showImageEditTools={false}
        taskDetailsData={adjustedTaskDetailsData}
        derivedItems={lineage.derivedItems}
        derivedGenerations={lineage.derivedGenerations}
        paginatedDerived={lineage.paginatedDerived}
        derivedPage={lineage.derivedPage}
        derivedTotalPages={lineage.derivedTotalPages}
        onSetDerivedPage={lineage.setDerivedPage}
        onNavigateToGeneration={onOpenExternalGeneration}
        currentMediaId={media?.id || ''}
        currentShotId={selectedShotId || shotId}
        replaceImages={replaceImages}
        onReplaceImagesChange={setReplaceImages}
        onSwitchToPrimary={variants.primaryVariant ? () => variants.setActiveVariantId(variants.primaryVariant.id) : undefined}
        taskId={panelTaskId}
      />
    );
  }, [
    showPanel, isInVideoEditMode, videoEditSubMode, panelVariant, isCloudMode,
    trimState, setStartTrim, setEndTrim, resetTrim, trimmedDuration, hasTrimChanges,
    saveTrimmedVideo, isSavingTrim, trimSaveProgress, trimSaveError, trimSaveSuccess,
    effectiveMedia.videoUrl, trimCurrentTime, trimVideoRef, videoEditing, selectedProjectId,
    regenerateFormProps, videoEnhance.settings, videoEnhance.updateSetting,
    videoEnhance.handleGenerate, videoEnhance.isGenerating, videoEnhance.generateSuccess,
    videoEnhance.canSubmit, panelTaskId, adjustedTaskDetailsData, lineage.derivedItems,
    lineage.derivedGenerations, lineage.paginatedDerived, lineage.derivedPage,
    lineage.derivedTotalPages, lineage.setDerivedPage, onOpenExternalGeneration,
    media?.id, selectedShotId, shotId, replaceImages, setReplaceImages,
    variants.primaryVariant, variants.setActiveVariantId,
  ]);

  // ========================================
  // BUILD LAYOUT PROPS (via hook — workflow + panel + navigation only)
  // ========================================

  const { layoutProps } = useLightboxWorkflowProps({
    panel: {
      showPanel,
      shouldShowSidePanel: shouldShowSidePanelWithTrim,
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
    segmentSlotMode: hasSegmentVideo ? segmentSlotMode : undefined,
  });

  // ========================================
  // RENDER
  // ========================================

  return (
    <LightboxProviders stateValue={lightboxStateValue}>
      <VideoEditProvider value={videoEditValue}>
        <LightboxShell
          onClose={onClose}
          hasCanvasOverlay={false}
          isRepositionMode={false}
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
          {isFormOnlyMode && segmentSlotMode ? (
            <SegmentSlotFormView
              segmentSlotMode={segmentSlotMode}
              onClose={onClose}
              onNavPrev={handleSlotNavPrev}
              onNavNext={handleSlotNavNext}
              hasPrevious={hasPrevious}
              hasNext={hasNext}
              readOnly={readOnly}
            />
          ) : (
            <LightboxLayout {...layoutProps} controlsPanelContent={controlsPanelContent} />
          )}
        </LightboxShell>
      </VideoEditProvider>
    </LightboxProviders>
  );
};
