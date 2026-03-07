import React from 'react';
import { Loader2 } from 'lucide-react';
import { Label } from '@/shared/components/ui/primitives/label';
import { FileInputEmptyState } from '@/shared/components/FileInput/FileInputEmptyState';
import { FileInputSelectedFiles } from '@/shared/components/FileInput/FileInputSelectedFiles';
import { useFileInputController } from '@/shared/components/FileInput/useFileInputController';

interface FileInputProps {
  onFileChange: (files: File[]) => void;
  onFileRemove?: () => void;
  acceptTypes?: ('image' | 'video')[];
  label?: string;
  currentFilePreviewUrl?: string | null;
  currentFileName?: string | null;
  className?: string;
  disabled?: boolean;
  multiple?: boolean;
  /** Hide the "X files selected" summary header */
  suppressSelectionSummary?: boolean;
  /** Hide the "Remove All Files" action */
  suppressRemoveAll?: boolean;
  /** Show a loader immediately on single-file selection to avoid mid-state flicker */
  showLoaderDuringSingleSelection?: boolean;
  /** Customize loader duration (ms) for single selection */
  loaderDurationMs?: number;
  /** Force loader regardless of internal selection-loading state */
  forceLoading?: boolean;
  /** Hide the "Accepted: image, video" text */
  suppressAcceptedTypes?: boolean;
}

const FileInput: React.FC<FileInputProps> = ({
  onFileChange,
  onFileRemove,
  acceptTypes = ['image'],
  label = 'Input File(s)',
  currentFilePreviewUrl,
  currentFileName,
  className = '',
  disabled = false,
  multiple = false,
  suppressSelectionSummary = false,
  suppressRemoveAll = false,
  showLoaderDuringSingleSelection = false,
  loaderDurationMs = 600,
  forceLoading = false,
  suppressAcceptedTypes = false,
}) => {
  const controller = useFileInputController({
    onFileChange,
    onFileRemove,
    acceptTypes,
    currentFilePreviewUrl: currentFilePreviewUrl ?? null,
    currentFileName: currentFileName ?? null,
    disabled,
    multiple,
    showLoaderDuringSingleSelection,
    loaderDurationMs,
    forceLoading,
  });

  return (
    <div className={`space-y-2 ${className}`}>
      {label && <Label htmlFor="file-input-element">{label}</Label>}
      <div
        className={`border-2 border-dashed rounded-md p-6 text-center
                    ${controller.isDraggingOver ? 'border-primary bg-primary/10' : 'border-muted-foreground/30'}
                    ${disabled ? 'cursor-not-allowed bg-muted/50' : 'cursor-pointer hover:border-muted-foreground/50'}`}
        onDragOver={controller.handleDragOver}
        onDragLeave={controller.handleDragLeave}
        onDrop={controller.handleDrop}
        onClick={() => !disabled && controller.fileInputRef.current?.click()}
      >
        <input
          id="file-input-element"
          ref={controller.fileInputRef}
          type="file"
          accept={controller.acceptedMimeTypes}
          onChange={controller.handleInputChange}
          className="hidden"
          disabled={disabled}
          multiple={multiple}
        />

        {controller.showLoader ? (
          <div className="flex flex-col items-center gap-y-2 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p>Processing file...</p>
          </div>
        ) : (
          <>
            {controller.displayFiles.length === 0 && (
              <FileInputEmptyState
                multiple={multiple}
                acceptTypes={acceptTypes}
                suppressAcceptedTypes={suppressAcceptedTypes}
              />
            )}

            {controller.displayFiles.length > 0 && (
              <FileInputSelectedFiles
                displayFiles={controller.displayFiles}
                displayPreviewUrls={controller.displayPreviewUrls}
                multiple={multiple}
                disabled={disabled}
                suppressSelectionSummary={suppressSelectionSummary}
                suppressRemoveAll={suppressRemoveAll}
                onRemoveAll={controller.handleRemoveAllFiles}
                onRemoveFile={controller.handleRemoveFile}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export { FileInput };
