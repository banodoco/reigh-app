import { useState, useRef, useCallback, useEffect } from 'react';
import { TIMELINE_PADDING_OFFSET } from '../constants';

interface SiblingRange {
  start: number;
  end: number;
}

interface UseTimelineStripDragOptions {
  /** Current start frame of the strip */
  startFrame: number;
  /** Current end frame of the strip */
  endFrame: number;
  /** Full range of frames on timeline (fullMax - fullMin) */
  fullRange: number;
  /** Minimum frame value on timeline */
  fullMin: number;
  /** Maximum frame value on timeline */
  fullMax: number;
  /** Container width in pixels */
  containerWidth: number;
  /** Current zoom level */
  zoomLevel: number;
  /** Ranges of sibling elements to avoid collision with */
  siblingRanges?: SiblingRange[];
  /** Minimum duration in frames */
  minDuration?: number;
  /** Whether drag is disabled */
  disabled?: boolean;
  /** Callback when drag completes with new range */
  onRangeChange?: (startFrame: number, endFrame: number) => void;
  /** Callback for treatment mode change (e.g., clip to adjust when range exceeds video) */
  onTreatmentChange?: (treatment: 'adjust' | 'clip') => void;
  /** Current treatment mode */
  treatment?: 'adjust' | 'clip';
  /** Video total frames (for auto-switching treatment) */
  videoTotalFrames?: number;
}

interface UseTimelineStripDragReturn {
  /** Current drag type or null if not dragging */
  isDragging: 'move' | 'left' | 'right' | null;
  /** Preview range during drag (null when not dragging) */
  dragPreviewRange: { start: number; end: number } | null;
  /** Display start frame (preview during drag, actual otherwise) */
  displayStart: number;
  /** Display end frame (preview during drag, actual otherwise) */
  displayEnd: number;
  /** Start a drag operation */
  handleDragStart: (type: 'move' | 'left' | 'right', e: React.MouseEvent) => void;
}

interface FrameRange {
  start: number;
  end: number;
}

interface PreviewRangeParams {
  dragType: 'move' | 'left' | 'right';
  frameDelta: number;
  origStart: number;
  origEnd: number;
  siblingRanges: SiblingRange[];
  fullMin: number;
  fullMax: number;
  minDuration: number;
}

function clampRangeToBounds(
  range: FrameRange,
  fullMin: number,
  fullMax: number,
): FrameRange {
  return {
    start: Math.max(fullMin, range.start),
    end: Math.min(fullMax, range.end),
  };
}

function enforceMinDuration(
  range: FrameRange,
  dragType: 'move' | 'left' | 'right',
  minDuration: number,
): FrameRange {
  if (range.end - range.start >= minDuration) return range;

  if (dragType === 'left') {
    return { start: range.end - minDuration, end: range.end };
  }

  if (dragType === 'right') {
    return { start: range.start, end: range.start + minDuration };
  }

  return range;
}

function computeMoveRange(params: PreviewRangeParams): FrameRange {
  const {
    frameDelta,
    origStart,
    origEnd,
    siblingRanges,
    fullMax,
    minDuration,
  } = params;

  let newStart = origStart;
  let newEnd = origEnd;

  const prevNeighborEnd = Math.max(
    0,
    ...siblingRanges.filter(sibling => sibling.end <= origStart).map(sibling => sibling.end)
  );
  const nextNeighborStart = Math.min(
    fullMax,
    ...siblingRanges.filter(sibling => sibling.start >= origEnd).map(sibling => sibling.start)
  );

  const startLimit = Math.max(0, prevNeighborEnd);
  const endLimit = Math.min(fullMax, nextNeighborStart);

  if (frameDelta >= 0) {
    const maxTranslateDelta = endLimit - origEnd;
    if (frameDelta <= maxTranslateDelta) {
      newStart = origStart + frameDelta;
      newEnd = origEnd + frameDelta;
    } else {
      newEnd = endLimit;
      newStart = Math.min(origStart + frameDelta, newEnd - minDuration);
    }
  } else {
    const minTranslateDelta = startLimit - origStart;
    if (frameDelta >= minTranslateDelta) {
      newStart = origStart + frameDelta;
      newEnd = origEnd + frameDelta;
    } else {
      newStart = startLimit;
      newEnd = Math.max(origEnd + frameDelta, newStart + minDuration);
    }
  }

  return {
    start: Math.max(startLimit, newStart),
    end: Math.min(endLimit, newEnd),
  };
}

function computeLeftResizeRange(params: PreviewRangeParams): FrameRange {
  const { frameDelta, origStart, origEnd, siblingRanges, minDuration } = params;
  let newStart = Math.max(0, Math.min(origEnd - minDuration, origStart + frameDelta));

  for (const sibling of siblingRanges) {
    if (sibling.end <= origEnd && newStart < sibling.end) {
      newStart = sibling.end;
    }
  }

  return { start: newStart, end: origEnd };
}

function computeRightResizeRange(params: PreviewRangeParams): FrameRange {
  const { frameDelta, origStart, origEnd, siblingRanges, minDuration } = params;
  let newEnd = Math.max(origStart + minDuration, origEnd + frameDelta);

  for (const sibling of siblingRanges) {
    if (sibling.start >= origStart && newEnd > sibling.start) {
      newEnd = sibling.start;
    }
  }

  return { start: origStart, end: newEnd };
}

function computePreviewRange(params: PreviewRangeParams): FrameRange {
  const baseRange = params.dragType === 'move'
    ? computeMoveRange(params)
    : params.dragType === 'left'
      ? computeLeftResizeRange(params)
      : computeRightResizeRange(params);

  const boundedRange = clampRangeToBounds(baseRange, params.fullMin, params.fullMax);
  return enforceMinDuration(boundedRange, params.dragType, params.minDuration);
}

/**
 * Hook for handling drag/resize operations on timeline strips with collision detection.
 *
 * Features:
 * - Move entire strip by dragging
 * - Resize from left or right edge
 * - Collision detection with sibling strips
 * - Minimum duration enforcement
 * - "Squeeze" behavior when dragging into boundaries
 * - Preview state during drag (commits on mouse up)
 *
 * @example
 * const { isDragging, displayStart, displayEnd, handleDragStart } = useTimelineStripDrag({
 *   startFrame: outputStartFrame,
 *   endFrame: outputEndFrame,
 *   fullRange, fullMin, fullMax,
 *   containerWidth, zoomLevel,
 *   siblingRanges: otherVideoRanges,
 *   onRangeChange: (start, end) => saveRange(start, end),
 * });
 */
export function useTimelineStripDrag(
  options: UseTimelineStripDragOptions
): UseTimelineStripDragReturn {
  const {
    startFrame,
    endFrame,
    fullRange,
    fullMin,
    fullMax,
    containerWidth,
    zoomLevel,
    siblingRanges = [],
    minDuration = 10,
    disabled = false,
    onRangeChange,
    onTreatmentChange,
    treatment,
    videoTotalFrames,
  } = options;

  const [isDragging, setIsDragging] = useState<'move' | 'left' | 'right' | null>(null);
  const [dragPreviewRange, setDragPreviewRange] = useState<{ start: number; end: number } | null>(null);
  const dragStartRef = useRef<{ mouseX: number; startFrame: number; endFrame: number } | null>(null);

  // Display values: use preview during drag, actual values otherwise
  const displayStart = dragPreviewRange?.start ?? startFrame;
  const displayEnd = dragPreviewRange?.end ?? endFrame;

  const handleDragStart = useCallback((type: 'move' | 'left' | 'right', e: React.MouseEvent) => {
    if (disabled || !onRangeChange) return;
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(type);
    dragStartRef.current = {
      mouseX: e.clientX,
      startFrame,
      endFrame,
    };

  }, [disabled, onRangeChange, startFrame, endFrame, fullMin, fullMax, fullRange, siblingRanges, zoomLevel]);

  // Handle drag move and end via document events
  useEffect(() => {
    if (!isDragging || !dragStartRef.current || !onRangeChange) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!dragStartRef.current) return;

      // Calculate effective width for frame calculations
      const effectiveWidth = (containerWidth * (zoomLevel > 1 ? zoomLevel : 1)) - (TIMELINE_PADDING_OFFSET * 2);
      if (effectiveWidth <= 0) return;

      const pixelDelta = e.clientX - dragStartRef.current.mouseX;
      const frameDelta = Math.round((pixelDelta / effectiveWidth) * fullRange);

      const { startFrame: origStart, endFrame: origEnd } = dragStartRef.current;
      const nextRange = computePreviewRange({
        dragType: isDragging,
        frameDelta,
        origStart,
        origEnd,
        siblingRanges,
        fullMin,
        fullMax,
        minDuration,
      });

      setDragPreviewRange(nextRange);
    };

    const handleMouseUp = () => {
      // Commit the final range
      if (dragPreviewRange) {
        const newDuration = dragPreviewRange.end - dragPreviewRange.start;

        // Auto-switch to "Fit to range" if range exceeds video duration in 1:1 mode
        if (treatment === 'clip' && videoTotalFrames && videoTotalFrames > 0 && newDuration > videoTotalFrames) {
          onTreatmentChange?.('adjust');
        }

        onRangeChange(dragPreviewRange.start, dragPreviewRange.end);
      }

      setIsDragging(null);
      setDragPreviewRange(null);
      dragStartRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [
    isDragging,
    onRangeChange,
    fullRange,
    fullMax,
    fullMin,
    dragPreviewRange,
    containerWidth,
    zoomLevel,
    siblingRanges,
    minDuration,
    treatment,
    videoTotalFrames,
    onTreatmentChange,
  ]);

  return {
    isDragging,
    dragPreviewRange,
    displayStart,
    displayEnd,
    handleDragStart,
  };
}
