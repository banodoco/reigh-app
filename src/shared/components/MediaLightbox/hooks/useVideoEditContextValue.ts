/**
 * useVideoEditContextValue
 *
 * Assembles the VideoEditState context value from useLightboxVideoMode output
 * and video enhance settings. Also handles routing variant params to the
 * correct video edit mode (enhance vs regenerate).
 *
 * Extracted from VideoLightbox to keep the component focused on layout/rendering.
 */

import { useMemo, useEffect, useCallback } from 'react';
import type { VideoEditState } from '../contexts/VideoEditContext';
import type { VideoEnhanceSettings } from './editSettingsTypes';

// ============================================================================
// Types
// ============================================================================

type VideoEditSubMode = 'trim' | 'replace' | 'regenerate' | 'enhance' | null;

interface VideoModeOutput {
  trimVideoRef: React.RefObject<HTMLVideoElement>;
  trimState: { startTrim: number; endTrim: number; videoDuration: number };
  trimCurrentTime: number;
  setTrimCurrentTime: (time: number) => void;
  trimmedDuration: number;
  hasTrimChanges: boolean;
  setStartTrim: (value: number) => void;
  setEndTrim: (value: number) => void;
  resetTrim: () => void;
  setVideoDuration: (duration: number) => void;
  videoEditing: {
    videoRef: React.RefObject<HTMLVideoElement>;
    selections: Array<{ id: string; start: number; end: number }>;
    activeSelectionId: string | null;
    handleUpdateSelection: (id: string, start: number, end: number) => void;
    setActiveSelectionId: (id: string | null) => void;
    handleRemoveSelection: (id: string) => void;
    handleAddSelection: () => void;
  } | null;
  videoEnhance: {
    settings: VideoEnhanceSettings;
    updateSetting: <K extends keyof VideoEnhanceSettings>(key: K, value: VideoEnhanceSettings[K]) => void;
  };
  handleEnterVideoEditMode: () => void;
  handleExitVideoEditMode: () => void;
  handleEnterVideoTrimMode: () => void;
  handleEnterVideoReplaceMode: () => void;
  handleEnterVideoRegenerateMode: () => void;
  handleEnterVideoEnhanceMode: () => void;
  isInVideoEditMode: boolean;
  isVideoTrimModeActive: boolean;
  isVideoEditModeActive: boolean;
}

interface UseVideoEditContextValueProps {
  /** Current video edit sub-mode */
  videoEditSubMode: VideoEditSubMode;
  /** Setter for video edit sub-mode (with persistence) */
  setVideoEditSubMode: (mode: VideoEditSubMode) => void;
  /** Output from useLightboxVideoMode */
  videoMode: VideoModeOutput;
  /** Whether we're in form-only mode (no media) */
  isFormOnlyMode: boolean;

  // Variant params routing
  /** Variant params to load into an edit mode */
  variantParamsToLoad: Record<string, unknown> | null;
  /** Clear variant params after loading */
  setVariantParamsToLoad: (params: Record<string, unknown> | null) => void;
  /** Setter for enhance settings (from persistence) */
  setEnhanceSettings: (settings: Partial<VideoEnhanceSettings>) => void;
}

// ============================================================================
// Hook
// ============================================================================

export function useVideoEditContextValue(props: UseVideoEditContextValueProps): VideoEditState {
  const {
    videoEditSubMode,
    setVideoEditSubMode,
    videoMode,
    isFormOnlyMode,
    variantParamsToLoad,
    setVariantParamsToLoad,
    setEnhanceSettings,
  } = props;

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
  // VARIANT PARAMS → EDIT MODE ROUTING
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
      } as VideoEnhanceSettings);
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
  // BUILD CONTEXT VALUE
  // ========================================

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

  return videoEditValue;
}
