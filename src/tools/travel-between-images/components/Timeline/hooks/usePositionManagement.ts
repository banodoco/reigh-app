import { useEffect } from 'react';
import type { GenerationRow } from '@/domains/generation/types';
import { useTimelinePositions } from './timeline-core/useTimelinePositions';
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

  const { lockPositions, unlockPositions } = positionSystem;
  useEffect(() => {
    if (isDragInProgress) {
      lockPositions();
    } else {
      unlockPositions();
    }
  }, [isDragInProgress, lockPositions, unlockPositions]);

  const updatePositions = async (newPositions: Map<string, number>) => {
    const preAppliedRollback = positionSystem.applyOptimisticPositionUpdate(newPositions);

    await runSerializedTimelineWrite(
      shotId,
      'timeline-drag-positions',
      async (signal) => {
        await positionSystem.updatePositions(newPositions, {
          operation: 'drag',
          optimisticAppliedExternally: true,
          externalRollback: preAppliedRollback,
          signal,
        });
      },

    );
  };

  return {
    positions: positionSystem.positions,
    updatePositions,
  };
}
