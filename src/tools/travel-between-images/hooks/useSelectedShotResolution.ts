import { useMemo } from 'react';
import { Shot } from '@/domains/generation/types';

interface UseSelectedShotResolutionOptions {
  /** Current shot ID from context */
  currentShotId: string | null;
  /** Array of shots from query */
  shots: Shot[] | undefined;
  /** Shot data from navigation state (for newly created shots) */
  shotFromState: Shot | undefined;
  /** Whether this is a newly created shot */
  isNewlyCreatedShot: boolean;
  /** Shot ID from URL hash */
  hashShotId: string;
  /** Whether we're in hash loading grace period */
  hashLoadingGrace: boolean;
  /** Whether navigation came from a shot click */
  viaShotClick: boolean;
}

interface UseSelectedShotResolutionResult {
  /** The resolved shot object (derived from currentShotId + shots + shotFromState) */
  selectedShot: Shot | null;
  /** The shot to edit (with priority logic for optimistic updates) */
  shotToEdit: Shot | null;
  /** Whether to show the shot editor view */
  shouldShowEditor: boolean;
}

/**
 * Consolidates all shot resolution logic into a single hook.
 *
 * Handles:
 * - Deriving selectedShot from currentShotId + shots array + shotFromState
 * - Computing shotToEdit with priority for optimistic updates
 * - Determining whether to show the editor view
 */
export function useSelectedShotResolution({
  currentShotId,
  shots,
  shotFromState,
  isNewlyCreatedShot,
  hashShotId,
  hashLoadingGrace,
  viaShotClick,
}: UseSelectedShotResolutionOptions): UseSelectedShotResolutionResult {
  // Derive selectedShot from currentShotId + shots + shotFromState
  // Priority: 1) shots array (source of truth), 2) shotFromState (for optimistic updates)
  const selectedShot = useMemo(() => {
    if (!currentShotId) return null;

    // First try shots array (the source of truth once cached)
    if (shots) {
      const found = shots.find(shot => shot.id === currentShotId);
      if (found) return found;
    }

    // Fallback to shotFromState for newly created shots not yet in cache
    if (shotFromState && shotFromState.id === currentShotId) {
      return shotFromState as Shot;
    }

    return null;
  }, [currentShotId, shots, shotFromState]);

  // Compute shotToEdit with priority for optimistic updates
  const shotToEdit = useMemo(() => {
    // Priority 1: Use shotFromState for newly created shots (not in cache yet)
    const shotFromStateMatches = shotFromState && (
      shotFromState.id === currentShotId ||
      shotFromState.id === hashShotId
    );

    if (viaShotClick && shotFromStateMatches) {
      return shotFromState as Shot;
    }

    // Priority 2: Use shot from hash if available in shots array
    if (hashShotId && shots) {
      const hashShot = shots.find(shot => shot.id === hashShotId);
      if (hashShot) {
        return hashShot;
      }
    }

    // Priority 3: Use selectedShot or find from shots array
    return selectedShot || (viaShotClick && currentShotId ? shots?.find(shot => shot.id === currentShotId) : null) || null;
  }, [selectedShot, viaShotClick, currentShotId, shots, hashShotId, shotFromState]);

  // Determine whether to show the editor view
  const shouldShowEditor = useMemo(() => {
    // Only show editor if we actually have a valid shot to edit
    const shotExists = selectedShot || (viaShotClick && currentShotId && shots?.find(shot => shot.id === currentShotId));
    const hashShotExists = hashShotId && shots?.find(shot => shot.id === hashShotId);
    const shotFromStateExists = viaShotClick && shotFromState && shotFromState.id === currentShotId;

    // Show the section (with loading state) if this is a newly created shot waiting for cache
    // OR if we're in the hash loading grace period
    return !!(shotExists || hashShotExists || shotFromStateExists || isNewlyCreatedShot || hashLoadingGrace);
  }, [selectedShot, viaShotClick, currentShotId, shots, hashShotId, shotFromState, isNewlyCreatedShot, hashLoadingGrace]);

  return {
    selectedShot,
    shotToEdit,
    shouldShowEditor,
  };
}
