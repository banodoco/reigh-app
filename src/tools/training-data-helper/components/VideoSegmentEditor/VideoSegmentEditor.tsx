import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/components/ui/card';
import { TrainingDataVideo, TrainingDataSegment } from '../../hooks/useTrainingData';
import { useTrainingData } from '../../hooks/useTrainingData';
import { Scissors } from 'lucide-react';
import { toast } from '@/shared/components/ui/sonner';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { formatTime } from '@/shared/lib/utils';
import { SegmentListItem } from './components/SegmentListItem';
import { SegmentFormDialog } from './components/SegmentFormDialog';
import { VideoPlayerControls } from './components/VideoPlayerControls';
import { useVideoPlayback } from './hooks/useVideoPlayback';
import { msToSeconds, secondsToMs, POST_CREATE_SEEK_DELAY_MS } from './constants';

// Color palette for segments
const segmentColors = [
  { bg: 'bg-blue-500/60', border: 'border-blue-500' },
  { bg: 'bg-purple-500/60', border: 'border-purple-500' },
  { bg: 'bg-pink-500/60', border: 'border-pink-500' },
  { bg: 'bg-indigo-500/60', border: 'border-indigo-500' },
  { bg: 'bg-cyan-500/60', border: 'border-cyan-500' },
  { bg: 'bg-teal-500/60', border: 'border-teal-500' },
  { bg: 'bg-emerald-500/60', border: 'border-emerald-500' },
  { bg: 'bg-lime-500/60', border: 'border-lime-500' },
  { bg: 'bg-yellow-500/60', border: 'border-yellow-500' },
  { bg: 'bg-orange-500/60', border: 'border-orange-500' },
  { bg: 'bg-red-500/60', border: 'border-red-500' },
  { bg: 'bg-rose-500/60', border: 'border-rose-500' },
];

const getSegmentColor = (index: number) => segmentColors[index % segmentColors.length];

const formatTimeWithMs = (seconds: number) =>
  formatTime(seconds, { showMilliseconds: true, millisecondsDigits: 3 });

const formatDuration = (ms: number) => formatTimeWithMs(msToSeconds(ms));

interface VideoSegmentEditorProps {
  video: TrainingDataVideo;
  segments: TrainingDataSegment[];
  onCreateSegment: (videoId: string, startTime: number, endTime: number, description?: string) => Promise<string>;
  onDeleteSegment: (segmentId: string) => void;
}

export function VideoSegmentEditor({ video, segments, onCreateSegment, onDeleteSegment }: VideoSegmentEditorProps) {
  const { getVideoUrl, markVideoAsInvalid } = useTrainingData();
  const playback = useVideoPlayback();

  const [segmentStartTime, setSegmentStartTime] = useState<number | null>(null);
  const [segmentEndTime, setSegmentEndTime] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [startFrameImage, setStartFrameImage] = useState<string | null>(null);
  const [endFrameImage, setEndFrameImage] = useState<string | null>(null);

  // Find segment that contains current time
  const getCurrentSegment = () => {
    const currentTimeMs = secondsToMs(playback.currentTime);
    const segmentIndex = segments.findIndex(segment =>
      currentTimeMs >= segment.startTime && currentTimeMs <= segment.endTime
    );
    return segmentIndex >= 0 ? { segment: segments[segmentIndex], index: segmentIndex } : null;
  };

  const currentSegmentInfo = getCurrentSegment();

  // Sort segments to show current segment first
  const sortedSegments = (() => {
    const currentSegment = currentSegmentInfo?.segment;
    return currentSegment
      ? [currentSegment, ...segments.filter(s => s.id !== currentSegment.id)]
      : segments;
  })();

  const jumpToTime = useCallback((time: number) => {
    playback.seekTo(time);
  }, [playback]);

  const handleStartSegment = useCallback(() => {
    const actualTime = playback.getActualTime();

    if (segmentStartTime !== null && actualTime < segmentStartTime) {
      setSegmentEndTime(segmentStartTime);
      setSegmentStartTime(actualTime);
      setDescription('');
      try { setStartFrameImage(playback.captureCurrentFrame()); }
      catch { setStartFrameImage(null); }
    } else {
      setSegmentStartTime(actualTime);
      setSegmentEndTime(null);
      setDescription('');
      setEndFrameImage(null);
      try { setStartFrameImage(playback.captureCurrentFrame()); }
      catch { setStartFrameImage(null); }
    }
  }, [playback, segmentStartTime]);

  const handleEndSegment = useCallback(() => {
    if (segmentStartTime === null) {
      toast.error('Please set start time first');
      return;
    }

    const actualTime = playback.getActualTime();

    if (actualTime < segmentStartTime) {
      const oldStart = segmentStartTime;
      setSegmentStartTime(actualTime);
      setSegmentEndTime(oldStart);
      try { setStartFrameImage(playback.captureCurrentFrame()); }
      catch { setStartFrameImage(null); }
    } else if (actualTime <= segmentStartTime + 0.001) {
      toast.error('End time must be after start time');
      return;
    } else {
      setSegmentEndTime(actualTime);
      try { setEndFrameImage(playback.captureCurrentFrame()); }
      catch { setEndFrameImage(null); }
    }
  }, [playback, segmentStartTime]);

  const clearSegmentState = useCallback(() => {
    setSegmentStartTime(null);
    setSegmentEndTime(null);
    setDescription('');
    setStartFrameImage(null);
    setEndFrameImage(null);
  }, []);

  const handleCreateSegment = useCallback(async () => {
    if (segmentStartTime === null || segmentEndTime === null) {
      toast.error('Please set both start and end times');
      return;
    }

    setIsCreating(true);
    try {
      const targetJumpTime = segmentEndTime;
      await onCreateSegment(video.id, secondsToMs(segmentStartTime), secondsToMs(segmentEndTime), description);
      clearSegmentState();
      setTimeout(() => jumpToTime(targetJumpTime), POST_CREATE_SEEK_DELAY_MS);
    } catch (error) {
      handleError(error, { context: 'VideoSegmentEditor', toastTitle: 'Failed to create segment' });
    } finally {
      setIsCreating(false);
    }
  }, [segmentStartTime, segmentEndTime, onCreateSegment, video.id, description, clearSegmentState, jumpToTime]);

  const handleCancelSegment = () => {
    clearSegmentState();
    toast.info('Segment creation canceled');
  };

  const previewSegment = (segment: TrainingDataSegment) => {
    if (!playback.videoRef.current) return;
    playback.seekTo(msToSeconds(segment.startTime));
  };

  const handleEditSegment = useCallback((segment: TrainingDataSegment) => {
    const startSeconds = msToSeconds(segment.startTime);
    const endSeconds = msToSeconds(segment.endTime);
    setSegmentStartTime(startSeconds);
    setSegmentEndTime(endSeconds);
    setDescription(segment.description ?? '');
    jumpToTime(startSeconds);
  }, [jumpToTime]);

  const handleDeleteLastSegment = useCallback(() => {
    if (segmentEndTime !== null) {
      setSegmentEndTime(null);
      setEndFrameImage(null);
    } else if (segmentStartTime !== null) {
      setSegmentStartTime(null);
      setStartFrameImage(null);
    } else {
      toast.error('No marks to remove');
    }
  }, [segmentEndTime, segmentStartTime]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case '1': e.preventDefault(); e.stopPropagation(); playback.jumpBackQuarterSecond(); break;
        case '2': e.preventDefault(); e.stopPropagation(); playback.setVideoPlaybackRate(0.25); break;
        case '3': e.preventDefault(); e.stopPropagation(); playback.setVideoPlaybackRate(0.5); break;
        case '4': e.preventDefault(); e.stopPropagation(); playback.jumpForwardQuarterSecond(); break;
        case '0': e.preventDefault(); e.stopPropagation(); playback.setVideoPlaybackRate(1); break;
        case ' ': e.preventDefault(); e.stopPropagation(); playback.togglePlayPause(); break;
        case 's': case 'S': case '5':
          e.preventDefault(); e.stopPropagation();
          if (segmentStartTime === null) {
            handleStartSegment();
          } else {
            handleEndSegment();
          }
          break;
        case 'Enter':
          e.preventDefault(); e.stopPropagation();
          if (segmentStartTime !== null && segmentEndTime !== null && !isCreating) handleCreateSegment();
          break;
        case 'd': case 'D': e.preventDefault(); e.stopPropagation(); handleDeleteLastSegment(); break;
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [
    segmentStartTime,
    segmentEndTime,
    isCreating,
    playback,
    handleStartSegment,
    handleEndSegment,
    handleCreateSegment,
    handleDeleteLastSegment,
  ]);

  return (
    <TooltipProvider>
      <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Video Player</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <VideoPlayerControls
              video={video}
              videoRef={playback.videoRef}
              videoUrl={getVideoUrl(video)}
              isPlaying={playback.isPlaying}
              currentTime={playback.currentTime}
              duration={playback.duration}
              playbackRate={playback.playbackRate}
              segments={segments}
              segmentStartTime={segmentStartTime}
              segmentEndTime={segmentEndTime}
              currentSegmentInfo={currentSegmentInfo}
              formatTimeWithMs={formatTimeWithMs}
              formatDuration={formatDuration}
              getSegmentColor={getSegmentColor}
              onPlay={() => playback.setIsPlaying(true)}
              onPause={() => playback.setIsPlaying(false)}
              onVideoError={(e) => {
                const videoElement = e.target as HTMLVideoElement;
                handleError(new Error('Video load error'), {
                  context: 'VideoSegmentEditor',
                  toastTitle: `Video file not available: ${video.originalFilename}`,
                  showToast: true,
                  logData: {
                    videoId: video.id,
                    src: videoElement.src,
                    error: videoElement.error,
                    networkState: videoElement.networkState,
                    readyState: videoElement.readyState
                  }
                });
                markVideoAsInvalid(video.id);
                playback.setVideoReady(false);
              }}
              onLoadStart={() => playback.setVideoReady(false)}
              onLoadedMetadata={(e) => {
                const videoElement = e.target as HTMLVideoElement;
                playback.setDuration(videoElement.duration);
              }}
              onLoadedData={() => playback.setVideoReady(true)}
              onCanPlay={() => playback.setVideoReady(true)}
              onTimeUpdate={(e) => {
                const videoElement = e.target as HTMLVideoElement;
                playback.setCurrentTime(videoElement.currentTime);
              }}
              onTogglePlayPause={playback.togglePlayPause}
              onSeekTo={playback.seekTo}
              onSetPlaybackRate={playback.setVideoPlaybackRate}
              onJumpBack={playback.jumpBackQuarterSecond}
              onJumpForward={playback.jumpForwardQuarterSecond}
              onPreviewSegment={previewSegment}
              onSetIsPlaying={playback.setIsPlaying}
            />

            <SegmentFormDialog
              segmentStartTime={segmentStartTime}
              segmentEndTime={segmentEndTime}
              currentTime={playback.currentTime}
              description={description}
              isCreating={isCreating}
              startFrameImage={startFrameImage}
              endFrameImage={endFrameImage}
              formatTimeWithMs={formatTimeWithMs}
              onDescriptionChange={setDescription}
              onStartSegment={handleStartSegment}
              onEndSegment={handleEndSegment}
              onCreateSegment={handleCreateSegment}
              onCancelSegment={handleCancelSegment}
              onJumpToTime={jumpToTime}
              onClearStartTime={() => { setSegmentStartTime(null); setStartFrameImage(null); }}
              onClearEndTime={() => { setSegmentEndTime(null); setEndFrameImage(null); }}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Segments ({segments.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {segments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Scissors className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No segments created yet</p>
              <p className="text-sm">Create your first segment using the controls above</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedSegments.map((segment) => {
                const originalIndex = segments.findIndex(s => s.id === segment.id);
                return (
                  <SegmentListItem
                    key={segment.id}
                    segment={segment}
                    color={getSegmentColor(originalIndex)}
                    isCurrentSegment={currentSegmentInfo?.segment?.id === segment.id}
                    formatDuration={formatDuration}
                    jumpToTime={jumpToTime}
                    onEdit={handleEditSegment}
                    onPreview={previewSegment}
                    onDelete={onDeleteSegment}
                    captureFrameAtTime={playback.captureFrameAtTime}
                    videoReady={playback.videoReady}
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
    </TooltipProvider>
  );
}
