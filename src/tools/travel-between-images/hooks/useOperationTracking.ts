import { useState, useCallback, useRef, useEffect } from 'react';

interface UseOperationTrackingResult {
  /** Whether a shot operation is currently in progress (suppresses query refetch) */
  isShotOperationInProgress: boolean;
  /** Whether a drag operation is in progress in the timeline */
  isDraggingInTimeline: boolean;
  /** Set the dragging state */
  setIsDraggingInTimeline: (dragging: boolean) => void;
  /** Signal that a shot operation has occurred (temporarily disables refetch) */
  signalShotOperation: () => void;
}

export function useOperationTracking(): UseOperationTrackingResult {
  const [isShotOperationInProgress, setIsShotOperationInProgress] = useState(false);
  const [isDraggingInTimeline, setIsDraggingInTimeline] = useState(false);
  const operationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to signal that a shot operation has occurred
  const signalShotOperation = useCallback(() => {

    // Clear any existing timeout
    if (operationTimeoutRef.current) {
      clearTimeout(operationTimeoutRef.current);
    }

    // Set flag to disable query
    setIsShotOperationInProgress(true);

    // Clear flag after timeline has had time to complete position updates
    // 100ms is enough for React's batch updates + timeline's immediate state updates
    operationTimeoutRef.current = setTimeout(() => {
      setIsShotOperationInProgress(false);
      operationTimeoutRef.current = null;
    }, 100);
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (operationTimeoutRef.current) {
        clearTimeout(operationTimeoutRef.current);
      }
    };
  }, []);

  return {
    isShotOperationInProgress,
    isDraggingInTimeline,
    setIsDraggingInTimeline,
    signalShotOperation,
  };
}
