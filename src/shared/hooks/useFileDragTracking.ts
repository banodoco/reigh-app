import { useCallback, useRef, useState } from 'react';
import { toast } from '@/shared/components/ui/sonner';

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

/** No-op dragOver handler that just prevents default browser behavior. */
export const preventDefaultDragOver = (e: React.DragEvent) => {
  e.preventDefault();
  e.stopPropagation();
};

/**
 * Create a drop handler for single-file upload with mime type validation.
 * Used by edit tool pages (EditImagesPage, EditVideoPage) that share
 * the same drop-to-upload pattern.
 */
export function createSingleFileDropHandler<T>(opts: {
  mimePrefix: string;
  mimeErrorMessage: string;
  resetDrag: () => void;
  getProjectId: () => string | undefined;
  upload: (file: File) => Promise<T>;
  onResult: (result: T) => void;
  context: string;
  toastTitle: string;
  uploadOperation: { execute: (fn: () => Promise<T>, opts: { context: string; toastTitle: string }) => Promise<T | undefined> };
}) {
  return async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    opts.resetDrag();

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith(opts.mimePrefix)) {
      toast.error(opts.mimeErrorMessage);
      return;
    }

    if (!opts.getProjectId()) {
      toast.error("Please select a project first");
      return;
    }

    const result = await opts.uploadOperation.execute(
      () => opts.upload(file),
      { context: opts.context, toastTitle: opts.toastTitle }
    );
    if (result) {
      opts.onResult(result);
    }
  };
}
