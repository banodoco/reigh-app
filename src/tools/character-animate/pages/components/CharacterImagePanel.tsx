import React from 'react';
import { Film, Upload } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/primitives/label';
import { cn } from '@/shared/components/ui/contracts/cn';

import type { CharacterImageState } from '../characterAnimate.types';
import { MediaContainerSkeleton, UploadingMediaState } from './MediaStates';
import { DeleteMediaButton, MediaDropZone, ReplaceDropOverlay } from './MediaPanelShared';

interface CharacterImagePanelProps {
  mode: 'animate' | 'replace';
  image: CharacterImageState | null;
  imageLoaded: boolean;
  isDraggingOverImage: boolean;
  isScrolling: boolean;
  settingsLoaded: boolean;
  isUploading: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  onDragOver: (event: React.DragEvent) => void;
  onDragEnter: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  onUploadInput: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onImageLoad: () => void;
  onDelete: () => void;
}

export function CharacterImagePanel(props: CharacterImagePanelProps) {
  const {
    mode,
    image,
    imageLoaded,
    isDraggingOverImage,
    isScrolling,
    settingsLoaded,
    isUploading,
    inputRef,
    onDragOver,
    onDragEnter,
    onDragLeave,
    onDrop,
    onUploadInput,
    onImageLoad,
    onDelete,
  } = props;

  return (
    <div className="space-y-3">
      <Label className="text-lg font-medium">{mode === 'animate' ? '✨ Character to animate' : '✨ Character to insert'}</Label>
      <MediaDropZone
        isDraggingOver={isDraggingOverImage}
        canOpenPicker={!image && !isUploading}
        onOpenPicker={() => inputRef.current?.click()}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {isUploading ? (
          <UploadingMediaState type="image" />
        ) : image ? (
          <>
            {!imageLoaded && <MediaContainerSkeleton />}
            <img
              src={image.url}
              alt="Character"
              className={cn(
                'absolute inset-0 w-full h-full object-contain transition-opacity duration-300',
                imageLoaded ? 'opacity-100' : 'opacity-0',
              )}
              onLoad={onImageLoad}
              onLoadStart={onImageLoad}
            />
            <DeleteMediaButton onDelete={onDelete} disabled={isUploading} />
            <ReplaceDropOverlay show={isDraggingOverImage && !isScrolling} />
          </>
        ) : !settingsLoaded ? (
          <MediaContainerSkeleton />
        ) : (
          <div className="text-center p-6 pointer-events-none">
            <Film className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-2">{isDraggingOverImage ? 'Drop image here' : 'Drag & drop or click to upload'}</p>
            <p className="text-xs text-muted-foreground">{isDraggingOverImage ? '' : 'PNG, JPG supported'}</p>
          </div>
        )}
      </MediaDropZone>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/jpg"
        className="hidden"
        onChange={onUploadInput}
      />
      {image && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="w-full"
        >
          <Upload className="h-4 w-4 mr-2" />
          Replace Image
        </Button>
      )}
    </div>
  );
}
