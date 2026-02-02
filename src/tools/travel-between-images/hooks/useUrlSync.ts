import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Shot } from '@/types/shots';

interface UseUrlSyncOptions {
  /** The currently selected shot */
  selectedShot: Shot | null;
  /** Whether shots are still loading */
  shotsLoading: boolean;
  /** Array of shots (from query) */
  shots: Shot[] | undefined;
  /** Shot data from navigation state (for newly created shots) */
  shotFromState: Shot | undefined;
  /** Whether navigation came from a shot click */
  viaShotClick: boolean;
  /** Set the current shot ID */
  setCurrentShotId: (id: string | null) => void;
}

/**
 * Keeps URL hash in sync with shot selection state.
 *
 * Handles:
 * - Updating URL hash when selection changes
 * - Clearing selection when navigating to tool root (no hash)
 * - Selecting shot from hash if not already selected
 */
export function useUrlSync({
  selectedShot,
  shotsLoading,
  shots,
  shotFromState,
  viaShotClick,
  setCurrentShotId,
}: UseUrlSyncOptions): void {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (shotsLoading || !shots) {
      return;
    }

    const currentHashShotId = location.hash?.replace('#', '') || '';

    // URL is the source of truth:
    // If we are on the tool root (no hash) but we still have a selected shot in state,
    // it means something navigated here without clearing selection.
    // Treat "no hash" as "back to shot list" and clear selection.
    if (!currentHashShotId && selectedShot && !viaShotClick) {
      setCurrentShotId(null);
      return;
    }

    // Init: Try to select shot from hash if not already selected
    if (currentHashShotId && selectedShot?.id !== currentHashShotId) {
      const matchingShot = shots.find((s) => s.id === currentHashShotId);
      const matchingShotFromState = shotFromState && shotFromState.id === currentHashShotId ? shotFromState : null;

      if (matchingShot || matchingShotFromState) {
        setCurrentShotId(currentHashShotId);
        return;
      } else {
        // Shot from hash doesn't exist - redirect to main view
        setCurrentShotId(null);
        navigate(location.pathname, { replace: true, state: { fromShotClick: false } });
        return;
      }
    }

    // Sync: Update URL hash to match current selection
    const basePath = location.pathname + (location.search || '');

    if (selectedShot) {
      const desiredHash = `#${selectedShot.id}`;
      if (location.hash !== desiredHash) {
        window.history.replaceState(null, '', `${basePath}${desiredHash}`);
      }
    } else if (location.hash) {
      // Only clear hash if we are NOT in the middle of an optimistic update
      const isOptimisticUpdate = shotFromState && shotFromState.id === currentHashShotId;
      if (!isOptimisticUpdate) {
        window.history.replaceState(null, '', basePath);
      }
    }
  }, [
    shotsLoading,
    shots,
    selectedShot,
    viaShotClick,
    location.pathname,
    location.search,
    location.hash,
    navigate,
    shotFromState,
    setCurrentShotId,
  ]);
}
