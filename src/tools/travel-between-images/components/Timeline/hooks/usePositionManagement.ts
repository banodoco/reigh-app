/**
 * Thin wrapper around useTimelinePositions for the timeline drag path.
 * Adds the serialized write queue and the external drag-gesture lock
 * (prevents realtime syncs from jittering positions mid-drag).
 *
 * For batch-mode image reorders, see useTimelineFrameUpdates.
 */

import { useEffect } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import { useTimelinePositions } from './useTimelinePositions';
import { runSerializedTimelineWrite } from '@/shared/lib/timelineWriteQueue';

interface PositionManagementProps {
  shotId: string;
  shotGenerations: GenerationRow[];
  frameSpacing: number;
  isDragInProgress: boolean;
  onFramePositionsChange?: (framePositions: Map<string, number>) => void;
}

export function usePositionManagement({
  shotId,
  shotGenerations,
  frameSpacing,
  isDragInProgress,
  onFramePositionsChange,
}: PositionManagementProps) {

  const positionSystem = useTimelinePositions({
    shotId,
    shotGenerations,
    frameSpacing,
    onPositionsChange: onFramePositionsChange,
  });

  // Lock/unlock positions during drag operations.
  // Use the stable callback refs rather than the full positionSystem object —
  // positionSystem is a new object on every render (it contains positions state),
  // so depending on it would fire this effect on every render and call
  // unlockPositions() in the middle of an active save, destroying the lock.
  const { lockPositions, unlockPositions } = positionSystem;
  useEffect(() => {
    if (isDragInProgress) {
      lockPositions();
    } else {
      unlockPositions();
    }
  }, [isDragInProgress, lockPositions, unlockPositions]);

  const setFramePositions = async (newPositions: Map<string, number>) => {
    // Apply optimistic visual update IMMEDIATELY — before entering the write queue.
    // Without this, the optimistic update was gated behind runSerializedTimelineWrite,
    // so if the queue was blocked by a concurrent batch-editor midpoint RPC (8-12s),
    // the user would see the node snap back instantly with no visual feedback.
    // We pre-apply here and pass the rollback to updatePositions so errors revert.
    const preAppliedRollback = positionSystem.applyOptimisticPositionUpdate(newPositions);

    await runSerializedTimelineWrite(
      shotId,
      'timeline-drag-positions',
      async () => {
        await positionSystem.updatePositions(newPositions, {
          operation: 'drag',
          skipOptimistic: true,       // already applied above
          externalRollback: preAppliedRollback, // used for rollback on DB error
        });
      },

    );
  };

  return {
    displayPositions: positionSystem.positions,
    setFramePositions,
  };
}
