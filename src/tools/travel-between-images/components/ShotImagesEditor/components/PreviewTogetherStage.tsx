import type { CSSProperties, MutableRefObject } from 'react';
import { Play, Pause, ChevronLeft, ChevronRight, Volume2, VolumeX, Expand } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import type { PreviewSegment } from './PreviewTogetherTypes';

interface PreviewTogetherStageProps {
  currentSegment: PreviewSegment;
  previewableSegments: PreviewSegment[];
  previewAspectStyle: CSSProperties;
  isPreviewVideoLoading: boolean;
  activeVideoSlot: 'A' | 'B';
  previewVideoRef: MutableRefObject<HTMLVideoElement | null>;
  previewVideoRefB: MutableRefObject<HTMLVideoElement | null>;
  previewAudioRef: MutableRefObject<HTMLAudioElement | null>;
  audioUrl?: string | null;
  onOpenInLightbox?: (segmentIndex: number) => void;
  crossfadeProgress: number;
  previewIsPlaying: boolean;
  previewCurrentTime: number;
  previewDuration: number;
  isAudioEnabled: boolean;
  onPlayPause: () => void;
  onNavigate: (direction: 'prev' | 'next') => void;
  createVideoHandlers: (slot: 'A' | 'B') => {
    onClick: () => void;
    onPlay: () => void;
    onPause: () => void;
    onTimeUpdate: () => void;
    onSeeked: () => void;
    onLoadedMetadata: () => void;
    onEnded: () => void;
  };
  onToggleAudio: () => void;
  onSeek: (time: number) => void;
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function PreviewTogetherStage({
  currentSegment,
  previewableSegments,
  previewAspectStyle,
  isPreviewVideoLoading,
  activeVideoSlot,
  previewVideoRef,
  previewVideoRefB,
  previewAudioRef,
  audioUrl,
  onOpenInLightbox,
  crossfadeProgress,
  previewIsPlaying,
  previewCurrentTime,
  previewDuration,
  isAudioEnabled,
  onPlayPause,
  onNavigate,
  createVideoHandlers,
  onToggleAudio,
  onSeek,
}: PreviewTogetherStageProps) {
  return (
    <div className="flex justify-center w-full">
      <div
        className="relative bg-black rounded-lg overflow-hidden max-w-full h-[60vh]"
        style={previewAspectStyle}
      >
        {currentSegment.hasVideo && isPreviewVideoLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Skeleton className="w-full h-full bg-muted/20" />
          </div>
        )}

        {currentSegment.hasVideo && (
          <>
            <video
              ref={previewVideoRef}
              className={`absolute inset-0 w-full h-full object-contain cursor-pointer ${activeVideoSlot === 'A' ? 'z-10' : 'z-0 pointer-events-none'}`}
              playsInline
              muted={activeVideoSlot !== 'A'}
              {...createVideoHandlers('A')}
            />
            <video
              ref={previewVideoRefB}
              className={`absolute inset-0 w-full h-full object-contain cursor-pointer ${activeVideoSlot === 'B' ? 'z-10' : 'z-0 pointer-events-none'}`}
              playsInline
              muted={activeVideoSlot !== 'B'}
              {...createVideoHandlers('B')}
            />
          </>
        )}

        {currentSegment.hasVideo && onOpenInLightbox && (
          <Button
            variant="secondary"
            size="icon"
            onClick={(event) => {
              event.stopPropagation();
              onOpenInLightbox(currentSegment.index);
            }}
            className="absolute top-3 right-3 z-20 bg-black/50 hover:bg-black/70 text-white rounded-lg h-9 w-9"
            title="Open in lightbox"
          >
            <Expand className="h-4 w-4" />
          </Button>
        )}

        {!currentSegment.hasVideo && (
          <div className="absolute inset-0 cursor-pointer" onClick={onPlayPause}>
            {currentSegment.startImageUrl && (
              <img
                src={currentSegment.startImageUrl}
                alt="Start"
                className="absolute inset-0 w-full h-full object-contain"
                style={{
                  opacity: 1 - crossfadeProgress,
                  transition: 'opacity 100ms ease-out',
                }}
              />
            )}
            {currentSegment.endImageUrl && (
              <img
                src={currentSegment.endImageUrl}
                alt="End"
                className="absolute inset-0 w-full h-full object-contain"
                style={{
                  opacity: crossfadeProgress,
                  transition: 'opacity 100ms ease-out',
                }}
              />
            )}
            <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/50 text-white text-xs">
              Crossfade (no video)
            </div>
            {!previewIsPlaying && (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-black/50 rounded-full p-4">
                  <Play className="h-8 w-8 text-white" />
                </div>
              </div>
            )}
          </div>
        )}

        {audioUrl && (
          <audio
            ref={previewAudioRef}
            src={audioUrl}
            preload="auto"
            style={{ display: 'none' }}
          />
        )}

        {previewableSegments.length > 1 && (
          <>
            <Button
              variant="secondary"
              size="lg"
              onClick={(event) => {
                event.stopPropagation();
                onNavigate('prev');
              }}
              className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button
              variant="secondary"
              size="lg"
              onClick={(event) => {
                event.stopPropagation();
                onNavigate('next');
              }}
              className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
          </>
        )}

        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-8 z-20">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onPlayPause();
              }}
              className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/30 transition-colors"
            >
              {previewIsPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
            </button>

            {audioUrl && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleAudio();
                }}
                className={`w-10 h-10 rounded-full backdrop-blur-sm text-white flex items-center justify-center transition-colors ${
                  isAudioEnabled ? 'bg-white/20 hover:bg-white/30' : 'bg-white/10 hover:bg-white/20'
                }`}
                title={isAudioEnabled ? 'Mute audio' : 'Unmute audio'}
              >
                {isAudioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>
            )}

            <span className="text-white text-sm tabular-nums min-w-[85px]">
              {formatTime(previewCurrentTime)} / {formatTime(previewDuration)}
            </span>

            <div className="flex-1 relative h-4 flex items-center">
              <div className="absolute inset-x-0 h-1.5 bg-white/30 rounded-full" />
              <div
                className="absolute left-0 h-1.5 bg-white rounded-full"
                style={{ width: `${(previewCurrentTime / (previewDuration || 1)) * 100}%` }}
              />
              <div
                className="absolute w-3 h-3 bg-white rounded-full shadow-md cursor-pointer"
                style={{ left: `calc(${(previewCurrentTime / (previewDuration || 1)) * 100}% - 6px)` }}
              />
              <input
                type="range"
                min={0}
                max={previewDuration || 100}
                step={0.1}
                value={previewCurrentTime}
                onChange={(event) => {
                  event.stopPropagation();
                  onSeek(parseFloat(event.target.value));
                }}
                onClick={(event) => event.stopPropagation()}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
