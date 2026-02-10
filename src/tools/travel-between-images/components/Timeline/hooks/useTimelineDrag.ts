import { useState, useCallback, useRef, useEffect } from "react";
import { GenerationRow } from "@/types/shots";
import { pixelToFrame, applyFluidTimeline, applyFluidTimelineMulti, TRAILING_ENDPOINT_KEY } from "../utils/timeline-utils";
import { log } from "@/shared/lib/logger";
import { handleError } from "@/shared/lib/errorHandler";
import { TIMELINE_PADDING_OFFSET } from "../constants";

interface DragState {
  isDragging: boolean;
  activeId: string | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  originalFramePos: number;
  dragSessionId?: string;
  hasMovedPastThreshold: boolean;
}

interface DragRefs {
  lastMouseUpTime: number;
  isBlocked: boolean;
}

interface UseTimelineDragProps {
  framePositions: Map<string, number>;
  setFramePositions: (positions: Map<string, number>) => void;
  images: GenerationRow[];
  onImageReorder: (orderedIds: string[], draggedItemId?: string) => void;
  fullMin: number;
  fullMax: number;
  fullRange: number;
  containerRect: DOMRect | null;
  setIsDragInProgress?: (isDragging: boolean) => void;
  selectedIds?: string[];
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export const useTimelineDrag = ({
  framePositions,
  setFramePositions,
  images: _images,
  onImageReorder: _onImageReorder,
  fullMin,
  fullMax,
  fullRange,
  containerRect,
  setIsDragInProgress,
  selectedIds = [],
  onDragStart,
  onDragEnd,
}: UseTimelineDragProps) => {

  const DRAG_THRESHOLD = 5;

  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    activeId: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
    originalFramePos: 0,
    hasMovedPastThreshold: false,
  });

  const [dropState, setDropState] = useState<{
    isDropping: boolean;
    frozenPositions: Map<string, number> | null;
  }>({
    isDropping: false,
    frozenPositions: null
  });

  const dragRefsRef = useRef<DragRefs>({
    lastMouseUpTime: 0,
    isBlocked: false,
  });

  const currentMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const pushModRef = useRef(false);
  const [pushMode, setPushMode] = useState<'right' | 'left' | null>(null);

  // Track modifier keys during drag for hint + calculation
  useEffect(() => {
    if (!dragState.isDragging) {
      setPushMode(null);
      return;
    }
    const update = (e: KeyboardEvent | MouseEvent) => {
      const push = e.metaKey || e.ctrlKey || e.altKey;
      pushModRef.current = push;
      const mode = (e.metaKey || e.ctrlKey) ? 'right' : e.altKey ? 'left' : null;
      setPushMode(prev => prev !== mode ? mode : prev);
    };
    window.addEventListener('keydown', update);
    window.addEventListener('keyup', update);
    return () => {
      window.removeEventListener('keydown', update);
      window.removeEventListener('keyup', update);
    };
  }, [dragState.isDragging]);

  // Calculate target frame from mouse position
  const calculateTargetFrame = useCallback((clientX: number, containerRect: DOMRect | null): number => {
    if (!containerRect) return dragState.originalFramePos;

    const containerWidth = containerRect.width;
    const containerLeft = containerRect.left;
    const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
    const relativeMouseX = clientX - containerLeft - TIMELINE_PADDING_OFFSET;
    const targetRelativePos = Math.max(0, relativeMouseX);

    const calculatedFrame = Math.max(0, pixelToFrame(targetRelativePos, effectiveWidth, fullMin, fullRange));

    // Allow timeline expansion beyond right edge
    if (targetRelativePos > effectiveWidth) {
      const overshoot = targetRelativePos - effectiveWidth;
      const overshootFrames = (overshoot / effectiveWidth) * fullRange;
      const maxExpansion = 81;
      const cappedOvershoot = Math.min(overshootFrames, maxExpansion);
      return Math.round(calculatedFrame + cappedOvershoot);
    }

    return calculatedFrame;
  }, [dragState.originalFramePos, fullMin, fullRange]);

  const calculateFinalPosition = useCallback((targetFrame: number): number => {
    return targetFrame;
  }, []);

  // ============================================================================
  // CONSOLIDATED: Single function for calculating drag positions
  // isPreview = true: during drag (skip quantization for smooth preview)
  // isPreview = false: final drop (apply quantization)
  // ============================================================================
  const calculateDragPositions = useCallback((clientX: number, isPreview: boolean): Map<string, number> => {
    // Return frozen positions during drop sync (preview only)
    if (isPreview && dropState.isDropping && dropState.frozenPositions) {
      return dropState.frozenPositions;
    }

    if (!dragState.isDragging || !dragState.activeId || !dragState.hasMovedPastThreshold) {
      return framePositions;
    }

    const targetFrame = calculateTargetFrame(clientX, containerRect);
    const finalPosition = calculateFinalPosition(targetFrame);
    const isMultiSelectDrag = selectedIds.length > 1 && selectedIds.includes(dragState.activeId);

    // Push/pull: ⌘/Ctrl or ⌥/Alt shifts all items right of the dragged item by delta
    if (pushModRef.current) {
      const newPositions = new Map(framePositions);
      const delta = finalPosition - dragState.originalFramePos;
      const draggedIds = isMultiSelectDrag ? selectedIds : [dragState.activeId];
      const rightBoundary = Math.max(...draggedIds.map(id => framePositions.get(id) ?? 0));

      // Position dragged items
      if (isMultiSelectDrag) {
        const sorted = draggedIds
          .map(id => ({ id, frame: framePositions.get(id) ?? 0 }))
          .sort((a, b) => a.frame - b.frame);
        sorted.forEach((item, i) => newPositions.set(item.id, finalPosition + i * 5));
      } else {
        newPositions.set(dragState.activeId, finalPosition);
      }

      // Shift items to the right of the dragged item by delta
      for (const [id, pos] of framePositions) {
        if (draggedIds.includes(id) || id === TRAILING_ENDPOINT_KEY) continue;
        if (pos > rightBoundary) newPositions.set(id, pos + delta);
      }

      const result = applyFluidTimeline(
        newPositions, dragState.activeId, finalPosition,
        undefined, fullMin, fullMax, isPreview
      );

      // Trailing endpoint: shift along with right-side items
      const trailing = framePositions.get(TRAILING_ENDPOINT_KEY);
      if (trailing !== undefined) result.set(TRAILING_ENDPOINT_KEY, trailing + delta);

      return result;
    }

    // Multi-select drag: bundle items together
    if (isMultiSelectDrag) {
      return applyFluidTimelineMulti(framePositions, selectedIds, finalPosition, isPreview);
    }

    // Single item drag
    const newPositions = new Map(framePositions);

    // Check for position conflict
    const conflictingItem = [...framePositions.entries()].find(
      ([id, pos]) => id !== dragState.activeId && pos === finalPosition
    );

    if (conflictingItem) {
      if (finalPosition === 0) {
        // Dropping at position 0: displace existing item to midpoint
        const sortedItems = [...framePositions.entries()]
          .filter(([id]) => id !== dragState.activeId && id !== conflictingItem[0])
          .sort((a, b) => a[1] - b[1]);
        const nextItem = sortedItems.find(([_, pos]) => pos > 0);
        const nextItemPos = nextItem ? nextItem[1] : 50;
        const midpoint = Math.floor(nextItemPos / 2);
        newPositions.set(conflictingItem[0], midpoint);
        newPositions.set(dragState.activeId, 0);
      } else {
        // Insert at +1 frame from target
        newPositions.set(dragState.activeId, finalPosition + 1);
      }
    } else {
      // No conflict - move to target (frame 0 constraint handled by shrinkOversizedGaps)
      newPositions.set(dragState.activeId, finalPosition);
    }

    return applyFluidTimeline(newPositions, dragState.activeId, finalPosition, undefined, fullMin, fullMax, isPreview);
  }, [
    dragState.isDragging,
    dragState.activeId,
    dragState.hasMovedPastThreshold,
    dropState.isDropping,
    dropState.frozenPositions,
    framePositions,
    selectedIds,
    calculateTargetFrame,
    calculateFinalPosition,
    containerRect,
    fullMin,
    fullMax,
  ]);

  // Preview positions during drag (skip quantization for smoothness)
  const calculateDragPreview = useCallback((): Map<string, number> => {
    if (!currentMousePosRef.current) {
      return framePositions;
    }
    return calculateDragPositions(currentMousePosRef.current.x, true);
  }, [calculateDragPositions, framePositions]);

  // Final positions on drop (apply quantization)
  const calculateDragPreviewWithPosition = useCallback((clientX: number): Map<string, number> => {
    return calculateDragPositions(clientX, false);
  }, [calculateDragPositions]);

  const handleMouseDown = useCallback((e: React.MouseEvent, imageId: string, containerRef: React.RefObject<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    currentMousePosRef.current = { x: e.clientX, y: e.clientY };

    const now = Date.now();
    const timeSinceLastUp = now - dragRefsRef.current.lastMouseUpTime;

    if (e.buttons !== 1 || dragState.isDragging || dragRefsRef.current.isBlocked || timeSinceLastUp < 50) {
      return;
    }

    const framePos = framePositions.get(imageId) ?? 0;
    const dragSessionId = `drag_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    log('TimelineDrag', 'start', { id: imageId.substring(0, 8), framePos });

    if (setIsDragInProgress) {
      setIsDragInProgress(true);
    }

    setDragState({
      isDragging: true,
      activeId: imageId,
      startX: e.clientX,
      startY: e.clientY,
      currentX: e.clientX,
      currentY: e.clientY,
      originalFramePos: framePos,
      dragSessionId,
      hasMovedPastThreshold: false,
    });

  }, [framePositions, dragState.isDragging, setIsDragInProgress]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!dragState.isDragging) return;

    const deltaX = Math.abs(e.clientX - dragState.startX);
    const deltaY = Math.abs(e.clientY - dragState.startY);
    const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);

    if (!dragState.hasMovedPastThreshold) {
      if (distance < DRAG_THRESHOLD) return;

      setDragState(prev => ({
        ...prev,
        hasMovedPastThreshold: true,
        currentX: e.clientX,
        currentY: e.clientY,
      }));
      onDragStart?.();
    } else {
      setDragState(prev => ({
        ...prev,
        currentX: e.clientX,
        currentY: e.clientY,
      }));
    }

    currentMousePosRef.current = { x: e.clientX, y: e.clientY };
    pushModRef.current = e.metaKey || e.ctrlKey || e.altKey;
  }, [dragState.isDragging, dragState.startX, dragState.startY, dragState.hasMovedPastThreshold, onDragStart]);

  const handleMouseUp = useCallback((e: MouseEvent, containerRef: React.RefObject<HTMLDivElement>) => {
    if (!dragState.isDragging || !dragState.activeId) return;

    // Below threshold = click, not drag
    if (!dragState.hasMovedPastThreshold) {
      setDragState({
        isDragging: false,
        activeId: null,
        startX: 0,
        startY: 0,
        currentX: 0,
        currentY: 0,
        originalFramePos: 0,
        hasMovedPastThreshold: false,
      });
      currentMousePosRef.current = null;
      if (setIsDragInProgress) setIsDragInProgress(false);
      onDragEnd?.();
      return;
    }

    const now = Date.now();
    dragRefsRef.current.lastMouseUpTime = now;
    dragRefsRef.current.isBlocked = true;

    const finalPositions = calculateDragPreviewWithPosition(currentMousePosRef.current?.x ?? e.clientX);
    const finalPos = finalPositions.get(dragState.activeId) ?? dragState.originalFramePos;

    log('TimelineDrag', 'end', {
      id: dragState.activeId.substring(0, 8),
      from: dragState.originalFramePos,
      to: finalPos,
    });

    // Apply positions with freeze to prevent flicker
    (async () => {
      setDropState({
        isDropping: true,
        frozenPositions: finalPositions
      });

      try {
        await setFramePositions(finalPositions);
      } catch (error) {
        handleError(error, { context: 'TimelineDrag', showToast: false });
      } finally {
        setTimeout(() => {
          setDropState({ isDropping: false, frozenPositions: null });
        }, 500);
      }
    })();

    // Log move summary
    const positionChanges = [...finalPositions.entries()]
      .filter(([id, newPos]) => (framePositions.get(id) ?? 0) !== newPos)
      .map(([id, newPos]) => ({
        id: id.slice(-8),
        oldPos: framePositions.get(id) ?? 0,
        newPos,
        delta: newPos - (framePositions.get(id) ?? 0)
      }));

    log('TimelineDrag', 'summary', {
      draggedId: dragState.activeId?.slice(-8),
      move: `${dragState.originalFramePos} → ${finalPos}`,
      totalChanges: positionChanges.length,
      changes: positionChanges.length > 0 ? positionChanges : 'none'
    });

    // Unblock after delay
    setTimeout(() => {
      dragRefsRef.current.isBlocked = false;
    }, 100);

    if (setIsDragInProgress) {
      setIsDragInProgress(false);
    }

    setDragState({
      isDragging: false,
      activeId: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      originalFramePos: 0,
      hasMovedPastThreshold: false,
    });

    onDragEnd?.();
    currentMousePosRef.current = null;
  }, [
    dragState,
    calculateDragPreviewWithPosition,
    setFramePositions,
    framePositions,
    onDragEnd,
    setIsDragInProgress,
  ]);

  // Computed values for rendering
  const dragOffset = dragState.isDragging && dragState.hasMovedPastThreshold
    ? { x: dragState.currentX - dragState.startX, y: 0 }
    : null;

  const currentDragFrame = dragState.isDragging && dragState.activeId && dragState.hasMovedPastThreshold
    ? calculateFinalPosition(calculateTargetFrame(dragState.currentX, containerRect))
    : null;

  const swapTargetId = currentDragFrame !== null && dragState.activeId
    ? [...framePositions.entries()].find(
        ([id, pos]) => id !== dragState.activeId && pos === currentDragFrame
      )?.[0] ?? null
    : null;

  const dragDistances = currentDragFrame !== null && dragState.activeId
    ? (() => {
        const preview = calculateDragPreview();
        const others = [...preview.entries()]
          .filter(([id]) => id !== dragState.activeId)
          .map(([_, pos]) => pos)
          .sort((a, b) => a - b);

        let prev: number | undefined;
        let next: number | undefined;
        others.forEach(pos => {
          if (pos < currentDragFrame) prev = pos;
          if (pos > currentDragFrame && next === undefined) next = pos;
        });

        return {
          distanceToPrev: prev !== undefined ? Math.round(currentDragFrame - prev) : undefined,
          distanceToNext: next !== undefined ? Math.round(next - currentDragFrame) : undefined,
        };
      })()
    : null;

  return {
    dragState,
    dragOffset,
    currentDragFrame,
    swapTargetId,
    dragDistances,
    pushMode,
    dynamicPositions: calculateDragPreview,
    calculateDragPreviewWithPosition,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
};
