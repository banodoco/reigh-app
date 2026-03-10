import { cn } from '@/shared/components/ui/contracts/cn';
import { formatTime } from '@/shared/lib/timeFormatting';
import type { TrimControlsPanelProps } from '@/shared/components/VideoTrimEditor/types';

interface TrimFramePreviewsProps {
  startFrame: string | null;
  endFrame: string | null;
  trimState: TrimControlsPanelProps['trimState'];
  labelSize: string;
}

function FramePreview({
  frame,
  alt,
}: {
  frame: string | null;
  alt: string;
}) {
  return (
    <div className="aspect-video bg-muted/30 rounded-lg overflow-hidden border border-border relative">
      {frame ? (
        <img src={frame} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs text-muted-foreground">No frame</span>
        </div>
      )}
    </div>
  );
}

export function TrimFramePreviews({
  startFrame,
  endFrame,
  trimState,
  labelSize,
}: TrimFramePreviewsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-2">
        <span className={cn(labelSize, 'text-muted-foreground block text-center')}>
          First frame
        </span>
        <FramePreview frame={startFrame} alt="Start frame" />
        <span className={cn(labelSize, 'text-primary block text-center font-medium')}>
          {formatTime(trimState.startTrim, {
            showMilliseconds: true,
            millisecondsDigits: 1,
          })}
        </span>
      </div>

      <div className="space-y-2">
        <span className={cn(labelSize, 'text-muted-foreground block text-center')}>
          Last frame
        </span>
        <FramePreview frame={endFrame} alt="End frame" />
        <span className={cn(labelSize, 'text-primary block text-center font-medium')}>
          {formatTime(trimState.videoDuration - trimState.endTrim, {
            showMilliseconds: true,
            millisecondsDigits: 1,
          })}
        </span>
      </div>
    </div>
  );
}
