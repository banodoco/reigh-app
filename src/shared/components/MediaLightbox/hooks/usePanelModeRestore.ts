/**
 * usePanelModeRestore Hook
 *
 * Handles automatic restoration of edit/info panel mode when media changes.
 * If the user was last in edit mode, automatically re-enters edit mode.
 */

import { useRef, useEffect } from 'react';

interface UsePanelModeRestoreProps {
  /** Current media ID for tracking changes */
  mediaId: string;
  /** Persisted panel mode from last used settings */
  persistedPanelMode: 'edit' | 'info' | null | undefined;
  /** Whether viewing a video */
  isVideo: boolean;
  /** Whether currently in special edit mode (image) */
  isSpecialEditMode: boolean;
  /** Whether currently in video edit mode */
  isInVideoEditMode: boolean;
  /** Whether initial video trim mode was requested */
  initialVideoTrimMode?: boolean;
  /** Whether auto-enter inpaint was requested */
  autoEnterInpaint?: boolean;
  /** Handler to enter video edit mode */
  handleEnterVideoEditMode: () => void;
  /** Handler to enter magic edit mode (image) */
  handleEnterMagicEditMode: () => void;
}

interface UsePanelModeRestoreReturn {
  /** Whether panel mode has been restored for current media */
  hasRestoredPanelMode: boolean;
}

/**
 * Automatically restores the last used panel mode (edit/info) when opening a media item.
 * Prevents loops by tracking restoration per-media and respecting explicit modes.
 */
export function usePanelModeRestore({
  mediaId,
  persistedPanelMode,
  isVideo,
  isSpecialEditMode,
  isInVideoEditMode,
  initialVideoTrimMode,
  autoEnterInpaint,
  handleEnterVideoEditMode,
  handleEnterMagicEditMode,
}: UsePanelModeRestoreProps): UsePanelModeRestoreReturn {
  const hasRestoredPanelModeRef = useRef(false);

  // Main restoration effect
  useEffect(() => {

    // Only restore once per media (prevent loops)
    if (hasRestoredPanelModeRef.current) {
      return;
    }

    // Don't restore if initialVideoTrimMode or autoEnterInpaint is set (explicit modes take precedence)
    if (initialVideoTrimMode || autoEnterInpaint) {
      hasRestoredPanelModeRef.current = true;
      return;
    }

    // Don't restore if already in edit mode
    if (isSpecialEditMode || isInVideoEditMode) {
      hasRestoredPanelModeRef.current = true;
      return;
    }

    if (persistedPanelMode === 'edit') {
      hasRestoredPanelModeRef.current = true;
      if (isVideo) {
        setTimeout(() => handleEnterVideoEditMode(), 0);
      } else {
        setTimeout(() => handleEnterMagicEditMode(), 0);
      }
    } else {
      hasRestoredPanelModeRef.current = true;
    }
  }, [persistedPanelMode, isVideo, handleEnterVideoEditMode, handleEnterMagicEditMode, initialVideoTrimMode, autoEnterInpaint, isSpecialEditMode, isInVideoEditMode]);

  // Reset restore flag when media changes
  useEffect(() => {
    hasRestoredPanelModeRef.current = false;
  }, [mediaId]);

  return {
    hasRestoredPanelMode: hasRestoredPanelModeRef.current,
  };
}
