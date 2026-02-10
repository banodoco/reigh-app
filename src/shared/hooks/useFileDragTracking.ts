import { useCallback, useRef, useState } from 'react';

/**
 * Track file drag enter/leave events with proper nesting counter.
 * Returns drag state and handlers.
 */
export function useFileDragTracking() {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingOver(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDraggingOver(false);
    }
  }, []);

  const resetDrag = useCallback(() => {
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
  }, []);

  return { isDraggingOver, handleDragEnter, handleDragLeave, resetDrag };
}
