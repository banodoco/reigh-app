import { useCallback } from 'react';
import { applyFluidTimeline, applyFluidTimelineMulti } from '../../utils/timeline-utils';
import { TIMELINE_PADDING_OFFSET } from '../../constants';

interface UseTapToMoveProps {
  enableTapToMove: boolean;
  framePositions: Map<string, number>;
  setFramePositions: (positions: Map<string, number>) => Promise<void>;
  fullMin: number;
  fullMax: number;
  fullRange: number;
  containerWidth: number;
  selectedIds: string[];
  clearSelection: () => void;
  containerRef: React.RefObject<HTMLDivElement>;
}

interface UseTapToMoveReturn {
  handleTapToMoveAction: (imageId: string, targetFrame: number) => Promise<void>;
  handleTapToMoveMultiAction: (imageIds: string[], targetFrame: number) => Promise<void>;
  handleTimelineTapToMove: (clientX: number) => void;
}

export function useTapToMove({
  enableTapToMove,
  framePositions,
  setFramePositions,
  fullMin,
  fullMax,
  fullRange,
  containerWidth,
  selectedIds,
  clearSelection,
  containerRef,
}: UseTapToMoveProps): UseTapToMoveReturn {
  const handleTapToMoveAction = useCallback(async (imageId: string, targetFrame: number) => {
    const originalPos = framePositions.get(imageId) ?? 0;
    if (targetFrame === originalPos) return;

    const newPositions = new Map(framePositions);
    const conflictingItem = [...framePositions.entries()].find(
      ([id, pos]) => id !== imageId && pos === targetFrame
    );

    if (conflictingItem) {
      if (targetFrame === 0) {
        const sortedItems = [...framePositions.entries()]
          .filter(([id]) => id !== imageId && id !== conflictingItem[0])
          .sort((a, b) => a[1] - b[1]);
        const nextItem = sortedItems.find(([_, pos]) => pos > 0);
        const nextItemPos = nextItem ? nextItem[1] : 50;
        const midpoint = Math.floor(nextItemPos / 2);
        newPositions.set(conflictingItem[0], midpoint);
        newPositions.set(imageId, 0);
      } else {
        newPositions.set(imageId, targetFrame + 1);
      }
    } else {
      newPositions.set(imageId, targetFrame);
    }

    if (originalPos === 0 && targetFrame !== 0 && !conflictingItem) {
      const nearest = [...framePositions.entries()]
        .filter(([id]) => id !== imageId)
        .sort((a, b) => a[1] - b[1])[0];
      if (nearest) newPositions.set(nearest[0], 0);
    }

    const finalPositions = applyFluidTimeline(newPositions, imageId, targetFrame, undefined, fullMin, fullMax);
    await setFramePositions(finalPositions);
    clearSelection();
  }, [framePositions, setFramePositions, fullMin, fullMax, clearSelection]);

  const handleTapToMoveMultiAction = useCallback(async (imageIds: string[], targetFrame: number) => {
    const finalPositions = applyFluidTimelineMulti(framePositions, imageIds, targetFrame);
    await setFramePositions(finalPositions);
    clearSelection();
  }, [framePositions, setFramePositions, clearSelection]);

  const handleTimelineTapToMove = useCallback((clientX: number) => {
    if (!enableTapToMove || !containerRef.current || selectedIds.length === 0) return;
    const rect = containerRef.current.getBoundingClientRect();
    const relativeX = clientX - rect.left;
    const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
    const adjustedX = relativeX - TIMELINE_PADDING_OFFSET;
    const normalizedX = Math.max(0, Math.min(1, adjustedX / effectiveWidth));
    const targetFrame = Math.round(fullMin + (normalizedX * fullRange));

    if (selectedIds.length > 1) {
      handleTapToMoveMultiAction(selectedIds, targetFrame);
    } else {
      handleTapToMoveAction(selectedIds[0], targetFrame);
    }
  }, [enableTapToMove, containerWidth, fullMin, fullRange, selectedIds, handleTapToMoveAction, handleTapToMoveMultiAction, containerRef]);

  return {
    handleTapToMoveAction,
    handleTapToMoveMultiAction,
    handleTimelineTapToMove,
  };
}
