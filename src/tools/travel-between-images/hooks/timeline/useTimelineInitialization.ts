/**
 * Timeline Initialization
 *
 * Hook for first-time positioning logic: assigning frames to unpositioned images.
 * Delegates the actual DB update to batchExchangePositions.
 */

import { useCallback } from 'react';
import type { ShotGeneration } from '@/shared/hooks/timeline/useTimelineCore';

// ============================================================================
// Types
// ============================================================================

interface UseTimelineInitializationOptions {
  shotId: string | null;
  shotGenerations: ShotGeneration[];
  batchExchangePositions: (
    updates: Array<{ shotGenerationId: string; newFrame: number }>
  ) => Promise<void>;
}

// ============================================================================
// Hook
// ============================================================================

export function useTimelineInitialization({
  shotId,
  shotGenerations,
  batchExchangePositions,
}: UseTimelineInitializationOptions) {
  /**
   * Initialize timeline frames for unpositioned images
   */
  const initializeTimelineFrames = useCallback(async (
    frameSpacing: number
  ) => {
    if (!shotId) {
      throw new Error('No shotId provided');
    }

    // Find unpositioned generations
    const unpositioned = shotGenerations.filter(sg => sg.timeline_frame === null);

    if (unpositioned.length === 0) {
      return;
    }

    // Assign sequential frames
    const updates = unpositioned.map((sg, index) => ({
      shotGenerationId: sg.id,
      newFrame: index * frameSpacing
    }));

    await batchExchangePositions(updates);
  }, [shotId, shotGenerations, batchExchangePositions]);

  return {
    initializeTimelineFrames,
  };
}
