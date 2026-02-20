import { RefObject } from 'react';
import { Button } from '@/shared/components/ui/button';
import { Play, Pause, RotateCcw, Clock, Video, SkipBack, SkipForward } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/shared/components/ui/tooltip';
import { TrainingDataVideo, TrainingDataSegment } from '../../../hooks/useTrainingData';
import { msToSeconds } from '../constants';

interface SegmentColor {
  bg: string;
  border: string;
}

interface CurrentSegmentInfo {
  segment: TrainingDataSegment;
  index: number;
}

/** Props for the HTML video element event handlers */
interface VideoEventHandlers {
  onPlay: () => void;
  onPause: () => void;
  onVideoError: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onLoadStart: () => void;
  onLoadedMetadata: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
  onLoadedData: () => void;
  onCanPlay: () => void;
  onTimeUpdate: (e: React.SyntheticEvent<HTMLVideoElement>) => void;
}

/** Props for playback control actions */
interface PlaybackActions {
  onTogglePlayPause: () => void;
  onSeekTo: (time: number) => void;
  onSetPlaybackRate: (rate: number) => void;
  onJumpBack: () => void;
  onJumpForward: () => void;
  onSetIsPlaying: (playing: boolean) => void;
}

/** Props related to segment display and interaction */
interface SegmentDisplayProps {
  segments: TrainingDataSegment[];
  segmentStartTime: number | null;
  segmentEndTime: number | null;
  currentSegmentInfo: CurrentSegmentInfo | null;
  formatDuration: (ms: number) => string;
  getSegmentColor: (index: number) => SegmentColor;
  onPreviewSegment: (segment: TrainingDataSegment) => void;
}

interface VideoPlayerControlsProps extends VideoEventHandlers, PlaybackActions, SegmentDisplayProps {
  video: TrainingDataVideo;
  videoRef: RefObject<HTMLVideoElement>;
  videoUrl: string;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  formatTimeWithMs: (seconds: number) => string;
}

export function VideoPlayerControls({
  video,
  videoRef,
  videoUrl,
  isPlaying,
  currentTime,
  duration,
  playbackRate,
  segments,
  segmentStartTime,
  segmentEndTime,
  currentSegmentInfo,
  formatTimeWithMs,
  formatDuration,
  getSegmentColor,
  onPlay,
  onPause,
  onVideoError,
  onLoadStart,
  onLoadedMetadata,
  onLoadedData,
  onCanPlay,
  onTimeUpdate,
  onTogglePlayPause,
  onSeekTo,
  onSetPlaybackRate,
  onJumpBack,
  onJumpForward,
  onPreviewSegment,
  onSetIsPlaying,
}: VideoPlayerControlsProps) {
  return (
    <div className="w-4/5 space-y-4">
      <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
        {videoUrl !== '' ? (
          <video
            ref={videoRef}
            src={videoUrl}
            crossOrigin="anonymous"
            className="w-full h-full object-contain"
            onPlay={onPlay}
            onPause={onPause}
            onError={onVideoError}
            onLoadStart={onLoadStart}
            onLoadedMetadata={onLoadedMetadata}
            onLoadedData={onLoadedData}
            onCanPlay={onCanPlay}
            onTimeUpdate={onTimeUpdate}
            controls={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center text-white">
              <Video className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm text-red-400 font-light">Video file not available</p>
              <p className="text-xs text-gray-400 mt-2 max-w-md">
                The video file "{video.originalFilename}" could not be loaded.
                It may have been moved or deleted from storage.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Video Controls */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={onJumpBack} className="flex items-center gap-1 text-xs px-2">
                <SkipBack className="h-3 w-3" />
                -0.25s
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Press '1' to jump back 0.25 seconds</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={onJumpForward} className="flex items-center gap-1 text-xs px-2">
                <SkipForward className="h-3 w-3" />
                +0.25s
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Press '4' to jump forward 0.25 seconds</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={playbackRate === 0.25 ? "default" : "outline"} size="sm" onClick={() => onSetPlaybackRate(0.25)} className="text-xs px-2">
                1/4x
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Press '2' for 1/4x speed</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={playbackRate === 0.5 ? "default" : "outline"} size="sm" onClick={() => onSetPlaybackRate(0.5)} className="text-xs px-2">
                1/2x
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Press '3' for 1/2x speed</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={playbackRate === 1 ? "default" : "outline"} size="sm" onClick={() => onSetPlaybackRate(1)} className="text-xs px-2">
                1x
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Press '0' for normal speed</p></TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="sm" onClick={onTogglePlayPause} className="flex items-center gap-1 min-w-[200px] px-6">
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                {isPlaying ? 'Pause' : 'Play'}
                {playbackRate !== 1 && <span className="text-xs ml-1">({playbackRate}x)</span>}
              </Button>
            </TooltipTrigger>
            <TooltipContent><p>Press Space to play/pause</p></TooltipContent>
          </Tooltip>

          <Button variant="outline" size="sm" onClick={() => onSeekTo(0)} className="flex items-center gap-1">
            <RotateCcw className="h-4 w-4" />
            Reset
          </Button>

          <div className="flex items-center gap-2 text-sm text-muted-foreground ml-auto">
            <Clock className="h-4 w-4" />
            {formatTimeWithMs(currentTime)} / {formatTimeWithMs(duration)}
          </div>
        </div>

        {/* Timeline */}
        <div className="relative">
          <input
            type="range"
            min="0"
            max={duration}
            step="0.1"
            value={currentTime}
            onChange={(e) => {
              if (videoRef.current && !videoRef.current.paused) {
                videoRef.current.pause();
                onSetIsPlaying(false);
              }
              onSeekTo(parseFloat(e.target.value));
            }}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
          />

          {/* Current segment tooltip */}
          {currentSegmentInfo && duration > 0 && (
            <div
              className="absolute top-6 transform -translate-x-1/2 z-10"
              style={{ left: `${(currentTime / duration) * 100}%` }}
            >
              <div className="bg-black/90 text-white text-xs rounded-lg p-2 whitespace-nowrap shadow-lg">
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 border-l-4 border-r-4 border-b-4 border-transparent border-b-black/90"></div>
                <div className="font-light">Segment {currentSegmentInfo.index + 1}</div>
                <div className="text-xs opacity-80">
                  {formatDuration(currentSegmentInfo.segment.startTime)} - {formatDuration(currentSegmentInfo.segment.endTime)}
                </div>
                {currentSegmentInfo.segment.description && (
                  <div className="text-xs opacity-80 max-w-32 truncate">
                    "{currentSegmentInfo.segment.description}"
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Existing segment markers */}
          <TooltipProvider>
            {segments.map((segment, index) => {
              const color = getSegmentColor(index);
              const startPercent = (msToSeconds(segment.startTime) / duration) * 100;
              const widthPercent = (msToSeconds(segment.endTime - segment.startTime) / duration) * 100;

              return (
                <Tooltip key={segment.id}>
                  <TooltipTrigger asChild>
                    <div
                      className={`absolute top-0 h-2 ${color.bg} rounded cursor-pointer hover:opacity-80 transition-opacity`}
                      style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}
                      onClick={() => onPreviewSegment(segment)}
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <div className="text-xs">
                      <div className="font-light">Segment {index + 1}</div>
                      <div>{formatDuration(segment.startTime)} - {formatDuration(segment.endTime)}</div>
                      <div>Duration: {formatDuration(segment.endTime - segment.startTime)}</div>
                      {segment.description && (
                        <div className="text-xs mt-1 max-w-48">"{segment.description}"</div>
                      )}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </TooltipProvider>

          {/* Current segment being created */}
          {segmentStartTime !== null && (
            <>
              <div
                className="absolute top-0 w-1 h-4 bg-green-500 rounded-full transform -translate-y-1"
                style={{ left: `${(segmentStartTime / duration) * 100}%` }}
              />
              {segmentEndTime !== null && (
                <>
                  <div
                    className="absolute top-0 h-2 bg-green-500/40 rounded"
                    style={{
                      left: `${(segmentStartTime / duration) * 100}%`,
                      width: `${((segmentEndTime - segmentStartTime) / duration) * 100}%`,
                    }}
                  />
                  <div
                    className="absolute top-0 w-1 h-4 bg-red-500 rounded-full transform -translate-y-1"
                    style={{ left: `${(segmentEndTime / duration) * 100}%` }}
                  />
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
