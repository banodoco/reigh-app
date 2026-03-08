import React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';

type TaskDetailsLazyVideoPreviewSize = 'small' | 'large';

const PREVIEW_SIZE_CLASSES: Record<
  TaskDetailsLazyVideoPreviewSize,
  {
    loadButtonPadding: string;
    loadIconSize: string;
    overlayPadding: string;
    overlayIconSize: string;
  }
> = {
  small: {
    loadButtonPadding: 'p-2',
    loadIconSize: 'w-6 h-6',
    overlayPadding: 'p-1.5',
    overlayIconSize: 'w-4 h-4',
  },
  large: {
    loadButtonPadding: 'p-3',
    loadIconSize: 'w-8 h-8',
    overlayPadding: 'p-2',
    overlayIconSize: 'w-6 h-6',
  },
};

interface PlayIconProps {
  className: string;
}

function PlayIcon({ className }: PlayIconProps) {
  return (
    <svg className={className} fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  );
}

interface TaskDetailsLazyVideoPreviewProps {
  src: string;
  isLoaded: boolean;
  onLoad: () => void;
  className?: string;
  size?: TaskDetailsLazyVideoPreviewSize;
}

export function TaskDetailsLazyVideoPreview({
  src,
  isLoaded,
  onLoad,
  className,
  size = 'small',
}: TaskDetailsLazyVideoPreviewProps) {
  const styles = PREVIEW_SIZE_CLASSES[size];

  return (
    <div className={cn('relative group cursor-pointer', className)}>
      {!isLoaded ? (
        <div
          className="w-full aspect-video bg-black rounded border shadow-sm flex items-center justify-center"
          onClick={onLoad}
        >
          <div
            className={cn(
              'bg-white/20 group-hover:bg-white/30 rounded-full transition-colors',
              styles.loadButtonPadding
            )}
          >
            <PlayIcon className={cn(styles.loadIconSize, 'text-white')} />
          </div>
        </div>
      ) : (
        <>
          <video
            src={src}
            className="w-full object-cover rounded border shadow-sm"
            loop
            muted
            playsInline
            autoPlay
            onClick={(event) => {
              const video = event.currentTarget;
              if (video.paused) {
                video.play();
              } else {
                video.pause();
              }
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
            <div className={cn('bg-black/50 rounded-full', styles.overlayPadding)}>
              <PlayIcon className={cn(styles.overlayIconSize, 'text-white')} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
