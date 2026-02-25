import { toast } from '@/shared/components/ui/runtime/sonner';

/** No-op dragOver handler that just prevents default browser behavior. */
export function preventDefaultDragOver(event: React.DragEvent): void {
  event.preventDefault();
  event.stopPropagation();
}

/**
 * Create a drop handler for single-file upload with mime type validation.
 * Used by edit tool pages that share the same drop-to-upload flow.
 */
export function createSingleFileDropHandler<T>(options: {
  mimePrefix: string;
  mimeErrorMessage: string;
  resetDrag: () => void;
  getProjectId: () => string | undefined;
  upload: (file: File) => Promise<T>;
  onResult: (result: T) => void;
  context: string;
  toastTitle: string;
  uploadOperation: {
    execute: (
      fn: () => Promise<T>,
      options: { context: string; toastTitle: string }
    ) => Promise<T | undefined>;
  };
}) {
  return async (event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    options.resetDrag();

    const droppedFiles = event.dataTransfer.files;
    if (!droppedFiles || droppedFiles.length === 0) {
      return;
    }

    const droppedFile = droppedFiles[0];
    if (!droppedFile.type.startsWith(options.mimePrefix)) {
      toast.error(options.mimeErrorMessage);
      return;
    }

    if (!options.getProjectId()) {
      toast.error('Please select a project first');
      return;
    }

    const uploadResult = await options.uploadOperation.execute(
      () => options.upload(droppedFile),
      { context: options.context, toastTitle: options.toastTitle },
    );

    if (uploadResult) {
      options.onResult(uploadResult);
    }
  };
}
