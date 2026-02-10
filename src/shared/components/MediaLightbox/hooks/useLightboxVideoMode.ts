/**
 * useLightboxVideoMode
 *
 * Consolidates all video-related hooks for MediaLightbox into a single hook.
 * This reduces the number of individual hook calls in the main component
 * and groups related video functionality together.
 *
 * Includes:
 * - Video trimming state and actions
 * - Trim save functionality
 * - Video editing (replace mode)
 * - Video enhance (interpolation/upscale)
 * - Video edit mode handlers
 */

import { useRef, useState, useEffect } from 'react';
import type { GenerationRow } from '@/types/shots';
import type { GenerationVariant } from '@/shared/hooks/useVariants';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';
import { useVideoTrimming, useTrimSave } from '@/shared/components/VideoTrimEditor';
import { useVideoEditing } from './useVideoEditing';
import { useVideoEnhance, type VideoEnhanceSettings } from './useVideoEnhance';
import { useVideoEditModeHandlers } from './useVideoEditModeHandlers';

interface UseLightboxVideoModeProps {
  // Core
  media: GenerationRow;
  isVideo: boolean;
  selectedProjectId: string | null;
  projectAspectRatio?: string;
  shotId?: string;
  actualGenerationId: string | null;

  // Effective URLs
  effectiveVideoUrl: string;

  // Active variant (for source tracking)
  activeVariant: GenerationVariant | null;

  // Variant management
  setActiveVariantId: (id: string) => void;
  refetchVariants: () => void;

  // Video edit sub-mode state - pass both the state and the wrapper
  videoEditSubMode: 'trim' | 'replace' | 'regenerate' | 'enhance' | null;
  // The wrapper that handles both local state and persistence - created by the caller
  setVideoEditSubMode: (mode: 'trim' | 'replace' | 'regenerate' | null) => void;

  // Persisted settings (only used by handlers, not for wrapper creation)
  persistedVideoEditSubMode: 'trim' | 'replace' | 'regenerate' | 'enhance' | null;
  setPersistedPanelMode: (mode: 'info' | 'edit') => void;

  // Enhance settings
  enhanceSettings: VideoEnhanceSettings;
  setEnhanceSettings: (settings: VideoEnhanceSettings) => void;

  // Callbacks
  onTrimModeChange?: (isTrimMode: boolean) => void;
  canRegenerate: boolean;
}

interface UseLightboxVideoModeReturn {
  // Refs
  trimVideoRef: React.RefObject<HTMLVideoElement>;

  // Trim state
  trimState: {
    startTrim: number;
    endTrim: number;
    videoDuration: number;
  };
  trimCurrentTime: number;
  setTrimCurrentTime: (time: number) => void;
  trimmedDuration: number;
  hasTrimChanges: boolean;

  // Trim actions
  setStartTrim: (value: number) => void;
  setEndTrim: (value: number) => void;
  resetTrim: () => void;
  setVideoDuration: (duration: number) => void;

  // Trim save
  isSavingTrim: boolean;
  trimSaveProgress: number;
  trimSaveError: string | null;
  trimSaveSuccess: boolean;
  saveTrimmedVideo: () => Promise<void>;

  // Video editing (replace mode)
  videoEditing: ReturnType<typeof useVideoEditing>;

  // Video enhance
  videoEnhance: {
    settings: VideoEnhanceSettings;
    updateSetting: <K extends keyof VideoEnhanceSettings>(key: K, value: VideoEnhanceSettings[K]) => void;
    handleGenerate: () => void;
    isGenerating: boolean;
    generateSuccess: boolean;
    canSubmit: boolean;
  };

  // Mode handlers
  handleEnterVideoEditMode: () => void;
  handleExitVideoEditMode: () => void;
  handleEnterVideoTrimMode: () => void;
  handleEnterVideoReplaceMode: () => void;
  handleEnterVideoRegenerateMode: () => void;
  handleEnterVideoEnhanceMode: () => void;
  handleExitVideoTrimMode: () => void;

  // Derived states
  isVideoTrimMode: boolean;
  isInVideoEditMode: boolean;
  isVideoTrimModeActive: boolean;
  isVideoEditModeActive: boolean;
}

export function useLightboxVideoMode(props: UseLightboxVideoModeProps): UseLightboxVideoModeReturn {
  const {
    media,
    isVideo,
    selectedProjectId,
    projectAspectRatio,
    shotId,
    actualGenerationId,
    effectiveVideoUrl,
    activeVariant,
    setActiveVariantId,
    refetchVariants,
    videoEditSubMode,
    setVideoEditSubMode, // The wrapper is passed in from the caller (handles both local state + persistence)
    persistedVideoEditSubMode,
    setPersistedPanelMode,
    enhanceSettings,
    setEnhanceSettings,
    onTrimModeChange,
    canRegenerate,
  } = props;

  // Refs
  const trimVideoRef = useRef<HTMLVideoElement>(null);

  // Trim current time state
  const [trimCurrentTime, setTrimCurrentTime] = useState(0);

  // Video trimming hook - manage trim state
  const trimmingHook = useVideoTrimming();
  const {
    trimState,
    setStartTrim,
    setEndTrim,
    resetTrim,
    setVideoDuration,
    trimmedDuration,
    hasTrimChanges,
  } = trimmingHook;

  // Derived states
  const isVideoTrimMode = videoEditSubMode === 'trim';
  const isInVideoEditMode = videoEditSubMode !== null;

  // Keep video playing within constrained region when trim values change
  useEffect(() => {
    const video = trimVideoRef.current;
    if (!video || !isVideoTrimMode) return;

    const keepStart = trimState.startTrim;
    const keepEnd = trimState.videoDuration - trimState.endTrim;

    if (video.currentTime < keepStart || video.currentTime >= keepEnd) {
      video.currentTime = keepStart;
    }

    if (video.paused) {
      video.play().catch(() => {});
    }
  }, [isVideoTrimMode, trimState.startTrim, trimState.endTrim, trimState.videoDuration]);

  // Trim save hook
  // Use getGenerationId to get actual generations.id
  // media.id from shot queries is shot_generations.id, not generations.id
  const trimSaveHook = useTrimSave({
    generationId: getGenerationId(media),
    projectId: selectedProjectId,
    sourceVideoUrl: effectiveVideoUrl,
    trimState,
    sourceVariantId: activeVariant?.id,
    onSuccess: (newVariantId) => {
      resetTrim();
      refetchVariants();
      setActiveVariantId(newVariantId);
      setVideoEditSubMode(null);
      onTrimModeChange?.(false);
    },
  });
  const {
    isSaving: isSavingTrim,
    saveProgress: trimSaveProgress,
    saveError: trimSaveError,
    saveSuccess: trimSaveSuccess,
    saveTrimmedVideo,
  } = trimSaveHook;

  // Video editing hook (replace mode)
  const videoEditing = useVideoEditing({
    media,
    selectedProjectId,
    projectAspectRatio,
    isVideo,
    videoDuration: trimState.videoDuration,
    videoUrl: effectiveVideoUrl,
    onExitVideoEditMode: () => {
      onTrimModeChange?.(false);
    },
  });

  // Video enhance hook
  const videoEnhance = useVideoEnhance({
    projectId: selectedProjectId,
    videoUrl: effectiveVideoUrl,
    shotId,
    generationId: actualGenerationId || undefined,
    activeVariantId: activeVariant?.id,
    settings: enhanceSettings,
    updateSettings: setEnhanceSettings,
  });

  // Video edit mode handlers
  const videoEditModeHandlers = useVideoEditModeHandlers({
    setVideoEditSubMode,
    persistedVideoEditSubMode,
    canRegenerate,
    setPersistedPanelMode,
    videoEditingSetIsVideoEditMode: videoEditing.setIsVideoEditMode,
    onTrimModeChange,
    resetTrim,
    setVideoDuration,
  });
  const {
    handleEnterVideoEditMode,
    handleExitVideoEditMode,
    handleEnterVideoTrimMode,
    handleEnterVideoReplaceMode,
    handleEnterVideoRegenerateMode,
    handleEnterVideoEnhanceMode,
    handleExitVideoTrimMode,
  } = videoEditModeHandlers;

  // Track if we're in video edit modes
  const isVideoTrimModeActive = isVideo && isVideoTrimMode;
  const isVideoEditModeActive = isVideo && videoEditing.isVideoEditMode;

  return {
    // Refs
    trimVideoRef,

    // Trim state
    trimState,
    trimCurrentTime,
    setTrimCurrentTime,
    trimmedDuration,
    hasTrimChanges,

    // Trim actions
    setStartTrim,
    setEndTrim,
    resetTrim,
    setVideoDuration,

    // Trim save
    isSavingTrim,
    trimSaveProgress,
    trimSaveError,
    trimSaveSuccess,
    saveTrimmedVideo,

    // Video editing
    videoEditing,

    // Video enhance
    videoEnhance: {
      settings: videoEnhance.settings,
      updateSetting: videoEnhance.updateSetting,
      handleGenerate: videoEnhance.handleGenerate,
      isGenerating: videoEnhance.isGenerating,
      generateSuccess: videoEnhance.generateSuccess,
      canSubmit: videoEnhance.canSubmit,
    },

    // Mode handlers
    handleEnterVideoEditMode,
    handleExitVideoEditMode,
    handleEnterVideoTrimMode,
    handleEnterVideoReplaceMode,
    handleEnterVideoRegenerateMode,
    handleEnterVideoEnhanceMode,
    handleExitVideoTrimMode,

    // Derived states
    isVideoTrimMode,
    isInVideoEditMode,
    isVideoTrimModeActive,
    isVideoEditModeActive,
  };
}
