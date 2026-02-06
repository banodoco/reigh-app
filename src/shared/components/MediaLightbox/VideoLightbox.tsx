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
import type { GenerationRow, GenerationParams, Shot } from '@/types/shots';
import type { SegmentSlotModeData, AdjacentSegmentsData, ShotOption, TaskDetailsData } from './types';
import { ASPECT_RATIO_TO_RESOLUTION, findClosestAspectRatio, parseRatio } from '@/shared/lib/aspectRatios';
import { useProject } from '@/shared/contexts/ProjectContext';
import { usePanes } from '@/shared/contexts/PanesContext';
import { useTaskStatusCounts } from '@/shared/hooks/useTasks';
import { useUserUIState } from '@/shared/hooks/useUserUIState';
import { usePendingGenerationTasks } from '@/shared/hooks/usePendingGenerationTasks';
import { useMarkVariantViewed } from '@/shared/hooks/useMarkVariantViewed';
import { LightboxProviders } from './components';
import { LightboxLayout } from './components/layouts';
import { SegmentSlotFormView } from './components/SegmentSlotFormView';
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
  useLightboxLayoutProps,
  useReplaceInShot,
} from './hooks';

// Import components
import { LightboxShell } from './components';
import { VideoEditProvider, type VideoEditState } from './contexts/VideoEditContext';

// Import utils
import { downloadMedia } from './utils';
import { readSegmentOverrides } from '@/shared/utils/settingsMigration';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';

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
    onShowTaskDetails,
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
    setIsTasksPaneOpen: setTasksPaneOpenContext,
    tasksPaneWidth: tasksPaneWidthContext,
    isTasksPaneLocked,
    setIsTasksPaneLocked,
  } = usePanes();

  const effectiveTasksPaneOpen = tasksPaneOpen ?? tasksPaneOpenContext;
  const effectiveTasksPaneWidth = tasksPaneWidth ?? tasksPaneWidthContext;

  const { data: statusCounts } = useTaskStatusCounts(selectedProjectId);
  const cancellableTaskCount = statusCounts?.processing || 0;

  // Refs
  const contentRef = useRef<HTMLDivElement>(null);
  const variantsSectionRef = useRef<HTMLDivElement>(null);

  // State
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSelectOpen, setIsSelectOpen] = useState(false);
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
      metadata?.resolution,
    ];
    for (const res of resolutionSources) {
      if (typeof res === 'string') {
        const dims = resolutionToDimensions(res);
        if (dims) return dims;
      }
    }

    const aspectRatioSources = [
      params?.aspect_ratio,
      metadata?.aspect_ratio,
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
    return media ? extractDimensionsFromMedia(media) : null;
  });

  React.useLayoutEffect(() => {
    if (!media) return;
    const dims = extractDimensionsFromMedia(media);
    if (dims) setImageDimensions(dims);
  }, [media?.id, extractDimensionsFromMedia]);

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
    swipeDisabled: videoEditSubMode !== null || readOnly,
  });

  const {
    variants,
    intendedActiveVariantIdRef,
    navigation,
    star,
    references,
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
    handleExitVideoTrimMode,
    isVideoTrimMode,
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
  // PENDING TASKS
  // ========================================

  const pendingTaskGenerationId = regenerateFormProps?.pairShotGenerationId || actualGenerationId;
  const { pendingCount: pendingTaskCount } = usePendingGenerationTasks(pendingTaskGenerationId, selectedProjectId);

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
    isInpaintMode: false,
    isSpecialEditMode: false, // Videos don't have image edit modes
    isInVideoEditMode,
    editMode: 'text',
    setEditMode: () => {},
    setIsInpaintMode: () => {},
  });

  // Build VideoEditContext value
  const videoEditValue = useMemo<VideoEditState>(() => ({
    // Mode state
    isInVideoEditMode,
    videoEditSubMode,

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

    // Enhance settings
    enhanceSettings: videoEnhance.settings,
    updateEnhanceSetting: videoEnhance.updateSetting,
  }), [
    // Mode state
    isInVideoEditMode,
    videoEditSubMode,
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
    // Enhance
    videoEnhance.settings,
    videoEnhance.updateSetting,
  ]);

  // ========================================
  // HANDLERS
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
      urlToDownload = effectiveMedia.videoUrl;
    }

    if (!urlToDownload || !media) return;

    setIsDownloading(true);
    try {
      const segmentOverrides = readSegmentOverrides(media.metadata as Record<string, unknown> | null);
      const prompt = media.params?.prompt ||
                     (media.metadata as Record<string, unknown> | undefined)?.enhanced_prompt as string | undefined ||
                     segmentOverrides.prompt ||
                     (media.metadata as Record<string, unknown> | undefined)?.prompt as string | undefined;
      await downloadMedia(urlToDownload, media.id, true, media.contentType, prompt);
    } finally {
      setIsDownloading(false);
    }
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

  // Generation name (stubbed)
  const generationName = media?.name || '';
  const isEditingGenerationName = false;
  const setIsEditingGenerationName = (_: boolean) => {};
  const handleGenerationNameChange = (_: string) => {};

  // ========================================
  // BUILD LAYOUT PROPS (via hook)
  // ========================================

  const { layoutProps } = useLightboxLayoutProps({
    showPanel,
    shouldShowSidePanel: shouldShowSidePanelWithTrim,
    // Core
    onClose,
    readOnly,
    selectedProjectId,
    isMobile,
    actualGenerationId: actualGenerationId || '',
    // Media
    media: media || ({} as GenerationRow),
    isVideo: true,
    effectiveMediaUrl: effectiveMedia.mediaUrl,
    effectiveVideoUrl: effectiveMedia.videoUrl,
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
    // Video edit
    isVideoTrimModeActive,
    isVideoEditModeActive,
    isInVideoEditMode,
    trimVideoRef,
    trimState,
    setStartTrim,
    setEndTrim,
    resetTrim,
    trimmedDuration,
    hasTrimChanges,
    saveTrimmedVideo,
    isSavingTrim,
    trimSaveProgress,
    trimSaveError,
    trimSaveSuccess,
    setVideoDuration,
    setTrimCurrentTime,
    trimCurrentTime,
    videoEditing,
    handleEnterVideoTrimMode,
    handleEnterVideoReplaceMode,
    handleEnterVideoRegenerateMode,
    handleEnterVideoEnhanceMode,
    handleExitVideoEditMode,
    handleEnterVideoEditMode,
    regenerateFormProps,
    isCloudMode,
    enhanceSettings: videoEnhance.settings,
    onUpdateEnhanceSetting: videoEnhance.updateSetting,
    onEnhanceGenerate: videoEnhance.handleGenerate,
    isEnhancing: videoEnhance.isGenerating,
    enhanceSuccess: videoEnhance.generateSuccess,
    canEnhance: videoEnhance.canSubmit,
    // Edit mode (stubs for video)
    isInpaintMode: false,
    isAnnotateMode: false,
    isSpecialEditMode: false,
    editMode: 'text',
    setEditMode: () => {},
    setIsInpaintMode: () => {},
    brushStrokes: [],
    currentStroke: null,
    isDrawing: false,
    isEraseMode: false,
    setIsEraseMode: () => {},
    brushSize: 20,
    setBrushSize: () => {},
    annotationMode: null,
    setAnnotationMode: () => {},
    selectedShapeId: null,
    handleKonvaPointerDown: () => {},
    handleKonvaPointerMove: () => {},
    handleKonvaPointerUp: () => {},
    handleShapeClick: () => {},
    strokeOverlayRef: { current: null },
    handleUndo: () => {},
    handleClearMask: () => {},
    getDeleteButtonPosition: () => null,
    handleToggleFreeForm: () => {},
    handleDeleteSelected: () => {},
    isRepositionDragging: false,
    repositionDragHandlers: {},
    getTransformStyle: () => '',
    repositionTransform: null,
    setTranslateX: () => {},
    setTranslateY: () => {},
    setScale: () => {},
    setRotation: () => {},
    toggleFlipH: () => {},
    toggleFlipV: () => {},
    resetTransform: () => {},
    imageContainerRef: { current: null },
    canvasRef: { current: null },
    maskCanvasRef: { current: null },
    isFlippedHorizontally: false,
    isSaving: false,
    handleExitInpaintMode: () => {},
    inpaintPanelPosition: 'right',
    setInpaintPanelPosition: () => {},
    // Edit form props (stubs for video)
    inpaintPrompt: '',
    setInpaintPrompt: () => {},
    inpaintNumGenerations: 1,
    setInpaintNumGenerations: () => {},
    loraMode: 'none',
    setLoraMode: () => {},
    customLoraUrl: '',
    setCustomLoraUrl: () => {},
    isGeneratingInpaint: false,
    inpaintGenerateSuccess: false,
    isCreatingMagicEditTasks: false,
    magicEditTasksCreated: false,
    handleExitMagicEditMode: () => {},
    handleUnifiedGenerate: async () => {},
    handleGenerateAnnotatedEdit: async () => {},
    handleGenerateReposition: async () => {},
    isGeneratingReposition: false,
    repositionGenerateSuccess: false,
    hasTransformChanges: false,
    handleSaveAsVariant: async () => {},
    isSavingAsVariant: false,
    saveAsVariantSuccess: false,
    createAsGeneration: false,
    setCreateAsGeneration: () => {},
    // Img2Img props (stubs for video)
    img2imgPrompt: '',
    setImg2imgPrompt: () => {},
    img2imgStrength: 0.5,
    setImg2imgStrength: () => {},
    enablePromptExpansion: false,
    setEnablePromptExpansion: () => {},
    isGeneratingImg2Img: false,
    img2imgGenerateSuccess: false,
    handleGenerateImg2Img: async () => {},
    img2imgLoraManager: null,
    availableLoras: [],
    editLoraManager: null,
    advancedSettings: {},
    setAdvancedSettings: () => {},
    isLocalGeneration: false,
    qwenEditModel: 'qwen',
    setQwenEditModel: () => {},
    // Info panel props
    showImageEditTools: false,
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
    handleReplaceInShot,
    isDeleting,
    handleDelete,
    // Adjacent segments
    adjacentSegments,
    // Segment slot mode
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
            <LightboxLayout {...layoutProps} />
          )}
        </LightboxShell>
      </VideoEditProvider>
    </LightboxProviders>
  );
};
