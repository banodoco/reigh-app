import { useCallback, useRef, useState } from 'react';

const DEFAULT_ACCEPTED_TYPES = ['Files'];

/**
 * Track drag enter/leave events with proper nesting counter.
 * Returns drag state and handlers.
 *
 * @param acceptedTypes - dataTransfer types to recognize (default: `['Files']`).
 *   When a drag matches, `matchedType` will be set to the first matching type.
 */
export function useFileDragTracking(acceptedTypes: string[] = DEFAULT_ACCEPTED_TYPES) {
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [matchedType, setMatchedType] = useState<string | null>(null);
  const dragCounterRef = useRef(0);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    const matched = acceptedTypes.find(t => e.dataTransfer.types.includes(t));
    if (matched) {
      setIsDraggingOver(true);
      setMatchedType(matched);
    }
  }, [acceptedTypes]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDraggingOver(false);
      setMatchedType(null);
    }
  }, []);

  const resetDrag = useCallback(() => {
    dragCounterRef.current = 0;
    setIsDraggingOver(false);
    setMatchedType(null);
  }, []);

  return { isDraggingOver, matchedType, handleDragEnter, handleDragLeave, resetDrag };
}
