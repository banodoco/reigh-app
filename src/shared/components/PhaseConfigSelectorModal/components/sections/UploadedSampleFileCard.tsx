import React from 'react';
import { Button } from '@/shared/components/ui/button';
import { MediaPreview } from '../MediaPreview';

interface UploadedSampleFileCardProps {
  file: File;
  previewUrl: string;
  index: number;
  isPrimary: boolean;
  onSelect: () => void;
  onDelete: () => void;
  selectedClassName?: string;
  unselectedClassName?: string;
}

export const UploadedSampleFileCard: React.FC<UploadedSampleFileCardProps> = ({
  file,
  previewUrl,
  index,
  isPrimary,
  onSelect,
  onDelete,
  selectedClassName = 'border-blue-500 bg-blue-50 dark:bg-blue-950/30',
  unselectedClassName = 'border-gray-200 hover:border-gray-300',
}) => (
  <div key={index} className="relative group">
    <div
      className={`relative rounded-lg border-2 overflow-hidden cursor-pointer transition-all ${
        isPrimary ? selectedClassName : unselectedClassName
      }`}
      onClick={onSelect}
      title={isPrimary ? 'Primary generation' : 'Click to set as primary'}
    >
      {file.type.startsWith('image/') || file.type.startsWith('video/') ? (
        <MediaPreview
          url={previewUrl}
          type={file.type.startsWith('video/') ? 'video' : 'image'}
          alt={file.name}
          height="h-24"
          objectFit="cover"
          enableMobileTap
        />
      ) : (
        <div className="w-full h-24 flex items-center justify-center bg-muted">
          <span className="text-xs text-muted-foreground">Preview unavailable</span>
        </div>
      )}

      {isPrimary && (
        <div className="absolute top-1 left-1 bg-blue-500 text-white text-xs px-2 py-1 rounded">
          Primary
        </div>
      )}

      <Button
        size="sm"
        variant="destructive"
        className="absolute top-1 right-1 h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
        title="Delete file"
      >
        ×
      </Button>
    </div>
    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate preserve-case" title={file.name}>
      {file.name}
    </p>
  </div>
);
