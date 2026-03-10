import { cn } from '@/shared/components/ui/contracts/cn';
import { TrimTimelineBar } from '@/shared/components/VideoTrimEditor/components/TrimTimelineBar';
import type { TrimControlsPanelProps } from '@/shared/components/VideoTrimEditor/types';

interface TrimTimelineDisplayProps {
  trimState: TrimControlsPanelProps['trimState'];
  onStartTrimChange: TrimControlsPanelProps['onStartTrimChange'];
  onEndTrimChange: TrimControlsPanelProps['onEndTrimChange'];
  currentTime: TrimControlsPanelProps['currentTime'];
  videoRef: TrimControlsPanelProps['videoRef'];
  isSaving: boolean;
  labelSize: string;
}

export function TrimTimelineDisplay({
  trimState,
  onStartTrimChange,
  onEndTrimChange,
  currentTime,
  videoRef,
  isSaving,
  labelSize,
}: TrimTimelineDisplayProps) {
  return (
    <>
      <p className={cn(labelSize, 'text-muted-foreground')}>
        Drag the handles to trim the beginning or end of the video. The red
        striped areas will be removed.
      </p>

      {trimState.videoDuration === 0 && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <p className="text-sm text-yellow-500">
            Warning: Video duration not loaded yet. Wait for video to load.
          </p>
        </div>
      )}

      <TrimTimelineBar
        duration={trimState.videoDuration}
        startTrim={trimState.startTrim}
        endTrim={trimState.endTrim}
        onStartTrimChange={onStartTrimChange}
        onEndTrimChange={onEndTrimChange}
        currentTime={currentTime}
        videoRef={videoRef}
        disabled={isSaving}
      />
    </>
  );
}
