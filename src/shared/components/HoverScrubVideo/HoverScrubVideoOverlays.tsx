import { cn } from '@/shared/components/ui/contracts/cn';
import { Button } from '@/shared/components/ui/button';

interface HoverScrubVideoOverlaysProps {
  posterOnlyUntilClick: boolean;
  isActivated: boolean;
  onActivate: () => void;
  isMobile: boolean;
  disableScrubbing: boolean;
  thumbnailMode: boolean;
  scrubberPosition: number | null;
  scrubberVisible: boolean;
  duration: number;
  showSpeedControls: boolean;
  speedControlsPosition: 'top-left' | 'bottom-center';
  speedOptions: number[];
  playbackRate: number;
  onSpeedChange: (speed: number) => void;
}

export function HoverScrubVideoOverlays({
  posterOnlyUntilClick,
  isActivated,
  onActivate,
  isMobile,
  disableScrubbing,
  thumbnailMode,
  scrubberPosition,
  scrubberVisible,
  duration,
  showSpeedControls,
  speedControlsPosition,
  speedOptions,
  playbackRate,
  onSpeedChange,
}: HoverScrubVideoOverlaysProps) {
  return (
    <>
      {posterOnlyUntilClick && !isActivated && (
        <div
          className="absolute inset-0 flex items-center justify-center bg-black/10 hover:bg-black/20 transition-colors cursor-pointer"
          onClick={onActivate}
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-black/70 text-white text-sm">
            ▶
          </div>
        </div>
      )}

      {!isMobile && !disableScrubbing && !thumbnailMode && isActivated && scrubberPosition !== null && (
        <div
          className={cn(
            'absolute top-0 bottom-0 w-0.5 bg-white shadow-lg z-30 pointer-events-none transition-opacity duration-300',
            scrubberVisible ? 'opacity-100' : 'opacity-0',
          )}
          style={{ left: `${scrubberPosition}%` }}
        >
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg border-2 border-black/20" />
          <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-black/80 text-white text-xs px-2 py-1 rounded whitespace-nowrap">
            {Number.isFinite(duration) && duration > 0 && (
              `${Math.floor((scrubberPosition / 100) * duration)}s / ${Math.floor(duration)}s`
            )}
          </div>
        </div>
      )}

      {!isMobile && !disableScrubbing && !thumbnailMode && isActivated && scrubberPosition !== null && (
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/30 z-20 pointer-events-none">
          <div
            className="h-full bg-primary transition-all duration-75"
            style={{ width: `${scrubberPosition}%` }}
          />
        </div>
      )}

      {!isMobile && !disableScrubbing && !thumbnailMode && isActivated && showSpeedControls && (
        <div
          className={cn(
            'absolute flex items-center gap-x-1 opacity-0 group-hover:opacity-100 group-touch:opacity-100 transition-opacity bg-black/60 rounded-md px-2 py-1 backdrop-blur-sm z-20',
            speedControlsPosition === 'top-left'
              ? 'top-2 left-2'
              : 'bottom-2 left-1/2 -translate-x-1/2',
          )}
        >
          {speedOptions.map((speed) => (
            <Button
              key={speed}
              variant={playbackRate === speed ? 'default' : 'secondary'}
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onSpeedChange(speed);
              }}
              className={cn(
                'h-5 min-w-[36px] px-1.5 text-xs',
                playbackRate === speed ? 'text-white' : 'text-foreground',
              )}
            >
              {speed}x
            </Button>
          ))}
        </div>
      )}
    </>
  );
}
