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
import type { GenerationRow } from '@/domains/generation/types';
import type { GenerationVariant } from '@/shared/hooks/useVariants';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { useVideoTrimming, useTrimSave } from '@/shared/components/VideoTrimEditor';
import { useVideoEditing } from './useVideoEditing';
import { useVideoEnhance, type VideoEnhanceSettings } from './useVideoEnhance';
import { useVideoEditModeHandlers } from './useVideoEditModeHandlers';
import type { TrimState } from '@/shared/types/videoTrim';

interface LightboxVideoCoreInput {
  media: GenerationRow;
  isVideo: boolean;
  selectedProjectId: string | null;
  projectAspectRatio?: string;
  shotId?: string;
  actualGenerationId: string | null;
  effectiveVideoUrl: string;
}

interface LightboxVideoVariantInput {
  activeVariant: GenerationVariant | null;
  setActiveVariantId: (id: string) => void;
  refetchVariants: () => void;
}

interface LightboxVideoEditStateInput {
  videoEditSubMode: 'trim' | 'replace' | 'regenerate' | 'enhance' | null;
  setVideoEditSubMode: (mode: 'trim' | 'replace' | 'regenerate' | 'enhance' | null) => void;
  persistedVideoEditSubMode: 'trim' | 'replace' | 'regenerate' | 'enhance' | null;
  setPersistedPanelMode: (mode: 'info' | 'edit') => void;
}

interface LightboxVideoEnhanceInput {
  settings: VideoEnhanceSettings;
  setSettings: (updates: Partial<VideoEnhanceSettings>) => void;
  canRegenerate: boolean;
}

interface UseLightboxVideoModeProps {
  core: LightboxVideoCoreInput;
  variants: LightboxVideoVariantInput;
  editState: LightboxVideoEditStateInput;
  enhance: LightboxVideoEnhanceInput;
  onTrimModeChange?: (isTrimMode: boolean) => void;
}

interface UseLightboxVideoModeReturn {
  // Refs
  trimVideoRef: React.RefObject<HTMLVideoElement>;

  // Trim state
  trimState: TrimState;
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
    updateSetting: (key: keyof VideoEnhanceSettings, value: VideoEnhanceSettings[keyof VideoEnhanceSettings]) => void;
    handleGenerate: () => Promise<void>;
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

interface UseTrimPlaybackGuardInput {
  trimVideoRef: React.RefObject<HTMLVideoElement>;
  trimState: UseLightboxVideoModeReturn['trimState'];
  isVideoTrimMode: boolean;
}

function useTrimPlaybackGuard({ trimVideoRef, trimState, isVideoTrimMode }: UseTrimPlaybackGuardInput): void {
  useEffect(() => {
    const video = trimVideoRef.current;
    if (!video || !isVideoTrimMode) {
      return;
    }

    const keepStart = trimState.startTrim;
    const keepEnd = trimState.videoDuration - trimState.endTrim;
    if (video.currentTime < keepStart || video.currentTime >= keepEnd) {
      video.currentTime = keepStart;
    }

    if (video.paused) {
      video.play().catch(() => {});
    }
  }, [isVideoTrimMode, trimState.startTrim, trimState.endTrim, trimState.videoDuration, trimVideoRef]);
}

export function useLightboxVideoMode(props: UseLightboxVideoModeProps): UseLightboxVideoModeReturn {
  const {
    onTrimModeChange,
  } = props;
  const {
    media,
    isVideo,
    selectedProjectId,
    projectAspectRatio,
    shotId,
    actualGenerationId,
    effectiveVideoUrl,
  } = props.core;
  const { activeVariant, setActiveVariantId, refetchVariants } = props.variants;
  const {
    videoEditSubMode,
    setVideoEditSubMode, // The wrapper is passed in from the caller (handles both local state + persistence)
    persistedVideoEditSubMode,
    setPersistedPanelMode,
  } = props.editState;
  const {
    settings: enhanceSettings,
    setSettings: setEnhanceSettings,
    canRegenerate,
  } = props.enhance;

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

  useTrimPlaybackGuard({ trimVideoRef, trimState, isVideoTrimMode });

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
    projectId: selectedProjectId ?? undefined,
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
  const isVideoTrimModeActive = isVideo && isVideoTrimMode;
  const isVideoEditModeActive = isVideo && videoEditing.isVideoEditMode;

  return {
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
    videoEnhance: {
      settings: videoEnhance.settings,
      updateSetting: videoEnhance.updateSetting,
      handleGenerate: videoEnhance.handleGenerate,
      isGenerating: videoEnhance.isGenerating,
      generateSuccess: videoEnhance.generateSuccess,
      canSubmit: videoEnhance.canSubmit,
    },
    handleEnterVideoEditMode: videoEditModeHandlers.handleEnterVideoEditMode,
    handleExitVideoEditMode: videoEditModeHandlers.handleExitVideoEditMode,
    handleEnterVideoTrimMode: videoEditModeHandlers.handleEnterVideoTrimMode,
    handleEnterVideoReplaceMode: videoEditModeHandlers.handleEnterVideoReplaceMode,
    handleEnterVideoRegenerateMode: videoEditModeHandlers.handleEnterVideoRegenerateMode,
    handleEnterVideoEnhanceMode: videoEditModeHandlers.handleEnterVideoEnhanceMode,
    handleExitVideoTrimMode: videoEditModeHandlers.handleExitVideoTrimMode,
    isVideoTrimMode,
    isInVideoEditMode,
    isVideoTrimModeActive,
    isVideoEditModeActive,
  };
}
