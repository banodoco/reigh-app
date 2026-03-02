import { useCallback, useState } from 'react';
import { TRAILING_ENDPOINT_KEY } from '../../utils/timeline-utils';
import { TIMELINE_PADDING_OFFSET } from '../../constants';

interface UseEndpointDragProps {
  readOnly: boolean;
  fullMin: number;
  fullMax: number;
  fullRange: number;
  containerWidth: number;
  maxFrameLimit: number;
  dynamicPositions: () => Map<string, number>;
  framePositions: Map<string, number>;
  setFramePositions: (positions: Map<string, number>) => Promise<void>;
  containerRef: React.RefObject<HTMLDivElement>;
  /** Shared ref for frozen dimensions during any drag (endpoint or image) */
  dragStartDimensionsRef: React.MutableRefObject<{ fullMin: number; fullMax: number; fullRange: number } | null>;
  /** Shared ref so the orchestrator knows an endpoint drag is active */
  isEndpointDraggingRef: React.MutableRefObject<boolean>;
}

interface UseEndpointDragReturn {
  endpointDragFrame: number | null;
  isEndpointDragging: boolean;
  handleEndpointMouseDown: (e: React.MouseEvent, endpointId: string) => void;
}

export function useEndpointDrag({
  readOnly,
  fullMin,
  fullMax,
  fullRange,
  containerWidth,
  maxFrameLimit,
  dynamicPositions,
  framePositions,
  setFramePositions,
  containerRef,
  dragStartDimensionsRef,
  isEndpointDraggingRef,
}: UseEndpointDragProps): UseEndpointDragReturn {
  const [endpointDragFrame, setEndpointDragFrame] = useState<number | null>(null);
  const [isEndpointDragging, setIsEndpointDragging] = useState(false);

  const handleEndpointMouseDown = useCallback((e: React.MouseEvent, _endpointId: string) => {
    if (readOnly) return;
    e.preventDefault();
    e.stopPropagation();

    dragStartDimensionsRef.current = { fullMin, fullMax, fullRange };
    isEndpointDraggingRef.current = true;
    setIsEndpointDragging(true);

    // Get image-only positions (exclude trailing key)
    const currentPositionsLocal = dynamicPositions();
    const sortedEntries = [...currentPositionsLocal.entries()]
      .filter(([id]) => id !== TRAILING_ENDPOINT_KEY)
      .sort((a, b) => a[1] - b[1]);
    const lastImageEntry = sortedEntries[sortedEntries.length - 1];
    if (!lastImageEntry) return;

    const [, imageFrame] = lastImageEntry;
    let currentEndFrame = framePositions.get(TRAILING_ENDPOINT_KEY) ?? (imageFrame + 49);

    const handleMouseMoveLocal = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const frozenFullMin = dragStartDimensionsRef.current?.fullMin ?? fullMin;
      const frozenFullRange = dragStartDimensionsRef.current?.fullRange ?? fullRange;
      const rect = containerRef.current.getBoundingClientRect();
      const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
      const relativeX = moveEvent.clientX - rect.left - TIMELINE_PADDING_OFFSET;
      let newFrame = frozenFullMin + (relativeX / effectiveWidth) * frozenFullRange;
      const minFrame = imageFrame + 5;
      const maxFrame = imageFrame + maxFrameLimit;
      newFrame = Math.max(minFrame, Math.min(Math.round(newFrame), maxFrame));
      const gap = newFrame - imageFrame;
      const quantizedGap = Math.max(5, Math.round((gap - 1) / 4) * 4 + 1);
      const quantizedFrame = imageFrame + quantizedGap;
      currentEndFrame = Math.min(quantizedFrame, maxFrame);
      // Visual-only update (no DB persist) -- TrailingEndpoint reads this via currentDragFrame prop
      setEndpointDragFrame(currentEndFrame);
    };

    const handleMouseUpLocal = async () => {
      dragStartDimensionsRef.current = null;
      isEndpointDraggingRef.current = false;
      setIsEndpointDragging(false);
      setEndpointDragFrame(null);
      document.removeEventListener('mousemove', handleMouseMoveLocal);
      document.removeEventListener('mouseup', handleMouseUpLocal);

      // Write final position through position system (handles optimistic update + DB persist)
      const newPositions = new Map(framePositions);
      newPositions.set(TRAILING_ENDPOINT_KEY, currentEndFrame);
      await setFramePositions(newPositions);
    };

    document.addEventListener('mousemove', handleMouseMoveLocal);
    document.addEventListener('mouseup', handleMouseUpLocal);
  }, [readOnly, fullMin, fullMax, fullRange, containerWidth, maxFrameLimit, dynamicPositions, framePositions, setFramePositions, containerRef, dragStartDimensionsRef, isEndpointDraggingRef]);

  return {
    endpointDragFrame,
    isEndpointDragging,
    handleEndpointMouseDown,
  };
}
