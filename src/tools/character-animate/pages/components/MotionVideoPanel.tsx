import React from 'react';
import { Film, Play, Upload } from 'lucide-react';

import { Button } from '@/shared/components/ui/button';
import { Label } from '@/shared/components/ui/primitives/label';
import { cn } from '@/shared/components/ui/contracts/cn';

import type { MotionVideoState } from '../characterAnimate.types';
import { MediaContainerSkeleton, UploadingMediaState } from './MediaStates';
import { DeleteMediaButton, MediaDropZone, ReplaceDropOverlay } from './MediaPanelShared';

interface MotionVideoPanelProps {
  mode: 'animate' | 'replace';
  motionVideo: MotionVideoState | null;
  motionVideoLoaded: boolean;
  motionVideoPlaying: boolean;
  isDraggingOverVideo: boolean;
  isScrolling: boolean;
  settingsLoaded: boolean;
  isUploading: boolean;
  inputRef: React.RefObject<HTMLInputElement>;
  videoRef: React.RefObject<HTMLVideoElement>;
  onDragOver: (event: React.DragEvent) => void;
  onDragEnter: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
  onUploadInput: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onVideoLoaded: () => void;
  onDelete: () => void;
  onPlay: () => void;
}

export function MotionVideoPanel(props: MotionVideoPanelProps) {
  const {
    mode,
    motionVideo,
    motionVideoLoaded,
    motionVideoPlaying,
    isDraggingOverVideo,
    isScrolling,
    settingsLoaded,
    isUploading,
    inputRef,
    videoRef,
    onDragOver,
    onDragEnter,
    onDragLeave,
    onDrop,
    onUploadInput,
    onVideoLoaded,
    onDelete,
    onPlay,
  } = props;

  return (
    <div className="space-y-3">
      <Label className="text-lg font-medium">{mode === 'animate' ? '🎬 Source of movement' : '🎬 Video to replace character in'}</Label>
      <MediaDropZone
        isDraggingOver={isDraggingOverVideo}
        canOpenPicker={!motionVideo && !isUploading}
        onOpenPicker={() => inputRef.current?.click()}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {isUploading ? (
          <UploadingMediaState type="video" />
        ) : motionVideo ? (
          <>
            {!motionVideoLoaded && <MediaContainerSkeleton />}
            {!motionVideoPlaying && motionVideo.posterUrl ? (
              <>
                <img
                  src={motionVideo.posterUrl}
                  alt="Video poster"
                  className={cn(
                    'absolute inset-0 w-full h-full object-contain transition-opacity duration-300 z-0',
                    motionVideoLoaded ? 'opacity-100' : 'opacity-0',
                  )}
                  onLoad={onVideoLoaded}
                />
                <div
                  className="absolute inset-0 flex items-center justify-center bg-black/20 cursor-pointer hover:bg-black/30 transition-colors z-[5]"
                  onClick={onPlay}
                >
                  <div className="bg-black/50 rounded-full p-4 hover:bg-black/70 transition-colors">
                    <Play className="h-12 w-12 text-white" fill="white" />
                  </div>
                </div>
              </>
            ) : (
              <video
                ref={videoRef}
                src={motionVideo.url}
                controls
                autoPlay={motionVideoPlaying}
                preload="metadata"
                playsInline
                muted
                className={cn(
                  'absolute inset-0 w-full h-full object-contain transition-opacity duration-300 z-0',
                  motionVideoLoaded ? 'opacity-100' : 'opacity-0',
                )}
                onLoadedData={onVideoLoaded}
              />
            )}
            <DeleteMediaButton onDelete={onDelete} disabled={isUploading} />
            <ReplaceDropOverlay show={isDraggingOverVideo && !isScrolling} />
          </>
        ) : !settingsLoaded ? (
          <MediaContainerSkeleton />
        ) : (
          <div className="text-center p-6 pointer-events-none">
            <Film className="mx-auto h-12 w-12 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground mb-2">{isDraggingOverVideo ? 'Drop video here' : 'Drag & drop or click to upload'}</p>
            <p className="text-xs text-muted-foreground">{isDraggingOverVideo ? '' : 'MP4, WebM, MOV supported'}</p>
          </div>
        )}
      </MediaDropZone>
      <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={onUploadInput} />
      {motionVideo && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => inputRef.current?.click()}
          disabled={isUploading}
          className="w-full"
        >
          <Upload className="h-4 w-4 mr-2" />
          Replace Video
        </Button>
      )}
    </div>
  );
}
