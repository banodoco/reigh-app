/**
 * useVideoEditModeHandlers Hook
 *
 * Provides handlers for entering/exiting video edit modes.
 * Separated from state management to allow proper hook ordering -
 * state is defined early in component, handlers are defined after
 * all dependencies (videoEditing, resetTrim, etc.) are available.
 */

import { useCallback, type RefObject } from 'react';

export type VideoEditSubMode = 'trim' | 'replace' | 'regenerate' | 'enhance' | null;

interface UseVideoEditModeHandlersProps {
  /** Setter for video edit sub-mode (combines local state + persistence) */
  setVideoEditSubMode: (mode: VideoEditSubMode) => void;
  /** Persisted video edit sub-mode (for restoring on enter) */
  persistedVideoEditSubMode: VideoEditSubMode | undefined;
  /** Whether regenerate mode is available (has segment data) */
  canRegenerate: boolean;
  /** Setter to persist panel mode (edit/info) */
  setPersistedPanelMode: (mode: 'edit' | 'info') => void;
  /** Setter from videoEditing hook to toggle its internal mode */
  videoEditingSetIsVideoEditMode: (value: boolean) => void;
  /** Callback when trim mode changes */
  onTrimModeChange?: (isTrimMode: boolean) => void;
  /** Reset trim state */
  resetTrim: () => void;
  /** Set video duration for trim controls */
  setVideoDuration: (duration: number) => void;
  /** Ref to the trim video element for reading duration */
  trimVideoRef: RefObject<HTMLVideoElement>;
}

interface UseVideoEditModeHandlersReturn {
  /** Enter video edit mode - restores last used sub-mode */
  handleEnterVideoEditMode: () => void;
  /** Exit video edit mode entirely */
  handleExitVideoEditMode: () => void;
  /** Switch to trim sub-mode */
  handleEnterVideoTrimMode: () => void;
  /** Switch to replace (portion) sub-mode */
  handleEnterVideoReplaceMode: () => void;
  /** Switch to regenerate (full segment) sub-mode */
  handleEnterVideoRegenerateMode: () => void;
  /** Switch to enhance (interpolation/upscale) sub-mode */
  handleEnterVideoEnhanceMode: () => void;
  /** Legacy handler for exiting trim mode specifically */
  handleExitVideoTrimMode: () => void;
}

/**
 * Hook providing handlers for video edit mode transitions.
 * Call this after videoEditing and useVideoTrimming hooks are initialized.
 */
export function useVideoEditModeHandlers({
  setVideoEditSubMode,
  persistedVideoEditSubMode,
  canRegenerate,
  setPersistedPanelMode,
  videoEditingSetIsVideoEditMode,
  onTrimModeChange,
  resetTrim,
  setVideoDuration,
  trimVideoRef,
}: UseVideoEditModeHandlersProps): UseVideoEditModeHandlersReturn {

  // Read video duration from the trim video ref
  const captureVideoDuration = useCallback(() => {
    const duration = trimVideoRef.current?.duration;
    if (duration != null && Number.isFinite(duration) && duration > 0) {
      setVideoDuration(duration);
    }
  }, [setVideoDuration, trimVideoRef]);

  // Handle entering video edit mode (unified) - restores last used sub-mode
  const handleEnterVideoEditMode = useCallback(() => {
    // Restore from persisted value (defaults to 'trim' if not set)
    let restoredMode: VideoEditSubMode = persistedVideoEditSubMode || 'trim';

    // Auto-fallback: if restoring to 'regenerate' but it's not available, use 'trim' instead
    if (restoredMode === 'regenerate' && !canRegenerate) {
      restoredMode = 'trim';
    }

    setVideoEditSubMode(restoredMode);
    setPersistedPanelMode('edit');

    // Set the appropriate mode flags based on restored sub-mode
    if (restoredMode === 'trim') {
      videoEditingSetIsVideoEditMode(false);
      onTrimModeChange?.(true);
    } else if (restoredMode === 'replace') {
      videoEditingSetIsVideoEditMode(true);
      resetTrim();
    } else if (restoredMode === 'regenerate') {
      videoEditingSetIsVideoEditMode(false);
      resetTrim();
    } else if (restoredMode === 'enhance') {
      videoEditingSetIsVideoEditMode(false);
      resetTrim();
    }

    // Try to capture video duration from already-loaded video element
    captureVideoDuration();
  }, [
    persistedVideoEditSubMode,
    canRegenerate,
    setVideoEditSubMode,
    setPersistedPanelMode,
    videoEditingSetIsVideoEditMode,
    onTrimModeChange,
    resetTrim,
    captureVideoDuration,
  ]);

  // Handle exiting video edit mode entirely
  const handleExitVideoEditMode = useCallback(() => {
    setVideoEditSubMode(null);
    setPersistedPanelMode('info');
    resetTrim();
    videoEditingSetIsVideoEditMode(false);
    onTrimModeChange?.(false);
  }, [setVideoEditSubMode, setPersistedPanelMode, resetTrim, videoEditingSetIsVideoEditMode, onTrimModeChange]);

  // Handle switching to trim sub-mode
  const handleEnterVideoTrimMode = useCallback(() => {
    setVideoEditSubMode('trim');
    videoEditingSetIsVideoEditMode(false);
    onTrimModeChange?.(true);

    // Try to capture video duration
    captureVideoDuration();
  }, [setVideoEditSubMode, videoEditingSetIsVideoEditMode, onTrimModeChange, captureVideoDuration]);

  // Handle switching to replace (portion) sub-mode
  const handleEnterVideoReplaceMode = useCallback(() => {
    setVideoEditSubMode('replace');
    videoEditingSetIsVideoEditMode(true);
    resetTrim();
  }, [setVideoEditSubMode, videoEditingSetIsVideoEditMode, resetTrim]);

  // Handle switching to regenerate (full segment) sub-mode
  const handleEnterVideoRegenerateMode = useCallback(() => {
    setVideoEditSubMode('regenerate');
    videoEditingSetIsVideoEditMode(false);
    resetTrim();
  }, [setVideoEditSubMode, videoEditingSetIsVideoEditMode, resetTrim]);

  // Handle switching to enhance (interpolation/upscale) sub-mode
  const handleEnterVideoEnhanceMode = useCallback(() => {
    setVideoEditSubMode('enhance');
    videoEditingSetIsVideoEditMode(false);
    resetTrim();
  }, [setVideoEditSubMode, videoEditingSetIsVideoEditMode, resetTrim]);

  // Legacy handler for exiting trim mode specifically
  const handleExitVideoTrimMode = useCallback(() => {
    setVideoEditSubMode(null);
    resetTrim();
    onTrimModeChange?.(false);
  }, [setVideoEditSubMode, resetTrim, onTrimModeChange]);

  return {
    handleEnterVideoEditMode,
    handleExitVideoEditMode,
    handleEnterVideoTrimMode,
    handleEnterVideoReplaceMode,
    handleEnterVideoRegenerateMode,
    handleEnterVideoEnhanceMode,
    handleExitVideoTrimMode,
  };
}
