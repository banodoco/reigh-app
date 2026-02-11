import React from 'react';
import { Image, Upload } from 'lucide-react';
import { ImageUploadActions } from '@/shared/components/ImageUploadActions';

interface TimelineEmptyStateProps {
  isDragOver: boolean;
  dragType: 'file' | 'generation' | null;
  shotId: string;
  onImageUpload?: (files: File[]) => Promise<void>;
  isUploadingImage?: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  /** Whether any drop handler is available (file or generation) */
  hasDropHandler: boolean;
}

/**
 * Full-size empty state overlay for the timeline when no images are present.
 * Shows a drop zone + upload button.
 */
export const TimelineEmptyState: React.FC<TimelineEmptyStateProps> = ({
  isDragOver,
  dragType,
  shotId,
  onImageUpload,
  isUploadingImage,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  hasDropHandler,
}) => {
  return (
    <>
      {hasDropHandler && (
        <div
          className={`absolute inset-0 z-20 flex items-center justify-center transition-all duration-200 ${
            isDragOver
              ? 'bg-primary/10 border-2 border-dashed border-primary'
              : 'bg-background/50 backdrop-blur-[0.5px]'
          }`}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <div className={`p-6 rounded-lg transition-all duration-200 ${
            isDragOver
              ? 'bg-primary/5 scale-105'
              : 'bg-background/80'
          }`}>
            <div className="flex flex-col items-center gap-3 text-center">
              {isDragOver ? (
                <>
                  <Upload className="h-12 w-12 text-primary animate-bounce" />
                  <div>
                    <h3 className="font-medium mb-2 text-primary">Drop {dragType === 'generation' ? 'image' : 'files'} here</h3>
                    <p className="text-sm text-muted-foreground">
                      Release to add to timeline
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Image className="h-10 w-10 text-muted-foreground" />
                  <div>
                    <h3 className="font-medium mb-2">No images on timeline</h3>
                  </div>

                  {onImageUpload && (
                    <ImageUploadActions
                      onImageUpload={onImageUpload}
                      isUploadingImage={isUploadingImage}
                      shotId={shotId}
                      inputId="timeline-empty-image-upload"
                      buttonSize="default"
                    />
                  )}

                  {/* Subtle drag and drop hint */}
                  <div className="flex items-center gap-2 text-xs text-muted-foreground/60">
                    <Upload className="h-3 w-3" />
                    <span>or drag and drop</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
