import { useMemo } from 'react';
import { Shot } from '@/types/shots';

type ShotSortMode = 'ordered' | 'newest' | 'oldest';

interface UseNavigationStateOptions {
  /** Array of shots */
  shots: Shot[] | undefined;
  /** Current sort mode */
  shotSortMode: ShotSortMode;
  /** Currently selected shot */
  selectedShot: Shot | null;
}

interface UseNavigationStateResult {
  /** Shots sorted according to shotSortMode */
  sortedShots: Shot[] | undefined;
  /** Index of selected shot in sortedShots (-1 if not found) */
  currentShotIndex: number;
  /** Whether there's a previous shot to navigate to */
  hasPrevious: boolean;
  /** Whether there's a next shot to navigate to */
  hasNext: boolean;
}

/**
 * Computes sorted shots array and navigation state (prev/next availability).
 *
 * Sorting modes:
 * - 'ordered': By position field (default shot order)
 * - 'newest': By created_at descending
 * - 'oldest': By created_at ascending
 */
export function useNavigationState({
  shots,
  shotSortMode,
  selectedShot,
}: UseNavigationStateOptions): UseNavigationStateResult {
  // Sort shots based on shotSortMode
  const sortedShots = useMemo(() => {
    if (!shots) return shots;

    if (shotSortMode === 'newest') {
      return [...shots].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateB - dateA; // Newest first
      });
    } else if (shotSortMode === 'oldest') {
      return [...shots].sort((a, b) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateA - dateB; // Oldest first
      });
    } else {
      // 'ordered' mode - sort by position
      return [...shots].sort((a, b) => (a.position || 0) - (b.position || 0));
    }
  }, [shots, shotSortMode]);

  // Calculate navigation state
  const navigationState = useMemo(() => {
    const currentShotIndex = sortedShots?.findIndex(shot => shot.id === selectedShot?.id) ?? -1;
    return {
      currentShotIndex,
      hasPrevious: currentShotIndex > 0,
      hasNext: currentShotIndex >= 0 && currentShotIndex < (sortedShots?.length ?? 0) - 1,
    };
  }, [sortedShots, selectedShot?.id]);

  return {
    sortedShots,
    ...navigationState,
  };
}
