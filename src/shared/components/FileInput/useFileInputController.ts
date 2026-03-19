import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';

interface UseFileInputControllerArgs {
  onFileChange: (files: File[]) => void;
  onFileRemove?: () => void;
  acceptTypes: Array<'image' | 'video'>;
  currentFilePreviewUrl: string | null;
  currentFileName: string | null;
  disabled: boolean;
  multiple: boolean;
  showLoaderDuringSingleSelection: boolean;
  loaderDurationMs: number;
  forceLoading: boolean;
}

const makeAcceptedMimeTypes = (acceptTypes: Array<'image' | 'video'>) =>
  acceptTypes
    .map((type) => (type === 'image' ? 'image/*' : 'video/*'))
    .join(',');

const isAcceptedFileType = (file: File, acceptTypes: Array<'image' | 'video'>) => {
  const fileTypeRoot = file.type.split('/')[0];
  return (
    (acceptTypes.includes('image') && fileTypeRoot === 'image')
    || (acceptTypes.includes('video') && fileTypeRoot === 'video')
  );
};

const makeDisplayFiles = (
  internalFiles: File[],
  currentFileName: string | null,
  currentFilePreviewUrl: string | null,
  multiple: boolean,
) => {
  if (internalFiles.length > 0) {
    return internalFiles;
  }
  if (!currentFileName || !currentFilePreviewUrl || multiple) {
    return [];
  }
  return [
    {
      name: currentFileName,
      type: currentFilePreviewUrl.startsWith('data:video') ? 'video/mp4' : 'image/png',
    } as File,
  ];
};

const makeDisplayPreviewUrls = (
  internalFiles: File[],
  internalPreviewUrls: string[],
  currentFilePreviewUrl: string | null,
  multiple: boolean,
) => {
  if (internalFiles.length > 0) {
    return internalPreviewUrls;
  }
  if (!currentFilePreviewUrl || multiple) {
    return [];
  }
  return [currentFilePreviewUrl];
};

export const useFileInputController = ({
  onFileChange,
  onFileRemove,
  acceptTypes,
  currentFilePreviewUrl,
  currentFileName,
  disabled,
  multiple,
  showLoaderDuringSingleSelection,
  loaderDurationMs,
  forceLoading,
}: UseFileInputControllerArgs) => {
  const [internalFiles, setInternalFiles] = useState<File[]>([]);
  const [internalPreviewUrls, setInternalPreviewUrls] = useState<string[]>([]);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [isSelectionLoading, setIsSelectionLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectionLoadingTimerRef = useRef<number | null>(null);

  const acceptedMimeTypes = useMemo(
    () => makeAcceptedMimeTypes(acceptTypes),
    [acceptTypes],
  );

  useEffect(() => {
    const newObjectUrls = internalFiles.map((file) => URL.createObjectURL(file));
    setInternalPreviewUrls((previousUrls) => {
      previousUrls.forEach((url) => URL.revokeObjectURL(url));
      return newObjectUrls;
    });

    return () => {
      newObjectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [internalFiles]);

  useEffect(() => () => {
    if (selectionLoadingTimerRef.current) {
      window.clearTimeout(selectionLoadingTimerRef.current);
      selectionLoadingTimerRef.current = null;
    }
  }, []);

  const clearNativeInput = useCallback(() => {
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const scheduleSelectionLoaderReset = useCallback(() => {
    if (selectionLoadingTimerRef.current) {
      window.clearTimeout(selectionLoadingTimerRef.current);
    }
    selectionLoadingTimerRef.current = window.setTimeout(() => {
      setIsSelectionLoading(false);
      selectionLoadingTimerRef.current = null;
    }, loaderDurationMs);
  }, [loaderDurationMs]);

  const handleFilesSelect = useCallback((fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) {
      setInternalFiles([]);
      onFileChange([]);
      clearNativeInput();
      return;
    }

    const filesArray = Array.from(fileList);
    const validFiles = filesArray.filter((file) => isAcceptedFileType(file, acceptTypes));
    const invalidFiles = filesArray.filter((file) => !isAcceptedFileType(file, acceptTypes));

    if (invalidFiles.length > 0) {
      toast.error(`Invalid file type for: ${invalidFiles.map((f) => f.name).join(', ')}. Accepted: ${acceptTypes.join(' or ')}.`);
    }

    if (!multiple && validFiles.length > 1) {
      toast.info("Multiple files selected, but only the first one will be used as 'multiple' is not enabled.");
    }

    if (showLoaderDuringSingleSelection && !multiple && validFiles.length > 0) {
      setIsSelectionLoading(true);
    }

    if (!multiple && validFiles.length > 0) {
      const singleFile = [validFiles[0]];
      setInternalFiles(singleFile);
      onFileChange(singleFile);
      if (showLoaderDuringSingleSelection) {
        scheduleSelectionLoaderReset();
      }
      clearNativeInput();
      return;
    }

    if (multiple) {
      const newFiles = [...internalFiles, ...validFiles];
      setInternalFiles(newFiles);
      onFileChange(newFiles);
    } else {
      setInternalFiles(validFiles);
      onFileChange(validFiles);
    }
    clearNativeInput();
  }, [
    acceptTypes,
    clearNativeInput,
    internalFiles,
    multiple,
    onFileChange,
    scheduleSelectionLoaderReset,
    showLoaderDuringSingleSelection,
  ]);

  const clearSelectionLoading = useCallback(() => {
    setIsSelectionLoading(false);
    if (selectionLoadingTimerRef.current) {
      window.clearTimeout(selectionLoadingTimerRef.current);
      selectionLoadingTimerRef.current = null;
    }
  }, []);

  const handleRemoveAllFiles = useCallback(() => {
    setInternalFiles([]);
    onFileChange([]);
    if (onFileRemove) {
      onFileRemove();
    }
    clearSelectionLoading();
    clearNativeInput();
  }, [clearNativeInput, clearSelectionLoading, onFileChange, onFileRemove]);

  const handleRemoveFile = useCallback((indexToRemove: number) => {
    const nextFiles = internalFiles.filter((_, index) => index !== indexToRemove);
    setInternalFiles(nextFiles);
    onFileChange(nextFiles);
    if (nextFiles.length === 0) {
      if (onFileRemove) {
        onFileRemove();
      }
      clearNativeInput();
    }
    clearSelectionLoading();
  }, [clearNativeInput, clearSelectionLoading, internalFiles, onFileChange, onFileRemove]);

  const handleInputChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    handleFilesSelect(event.target.files);
  }, [handleFilesSelect]);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!disabled) {
      setIsDraggingOver(true);
    }
  }, [disabled]);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDraggingOver(false);
    if (disabled || !event.dataTransfer.files || event.dataTransfer.files.length === 0) {
      return;
    }
    handleFilesSelect(event.dataTransfer.files);
    event.dataTransfer.clearData();
  }, [disabled, handleFilesSelect]);

  const displayFiles = makeDisplayFiles(
    internalFiles,
    currentFileName,
    currentFilePreviewUrl,
    multiple,
  );
  const displayPreviewUrls = makeDisplayPreviewUrls(
    internalFiles,
    internalPreviewUrls,
    currentFilePreviewUrl,
    multiple,
  );

  const showLoader = forceLoading || (showLoaderDuringSingleSelection && !multiple && isSelectionLoading);

  return {
    acceptedMimeTypes,
    displayFiles,
    displayPreviewUrls,
    fileInputRef,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    handleInputChange,
    handleRemoveAllFiles,
    handleRemoveFile,
    isDraggingOver,
    showLoader,
  };
};
