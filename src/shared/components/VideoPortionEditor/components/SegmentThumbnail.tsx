import { cn } from '@/shared/components/ui/contracts/cn';
import { useVideoPortionFrameExtraction } from '@/shared/components/VideoPortionEditor/hooks/useVideoFrameExtraction';

interface SegmentThumbnailProps {
  videoUrl: string;
  time: number;
  size?: 'small' | 'large';
}

export function SegmentThumbnail({
  videoUrl,
  time,
  size = 'small',
}: SegmentThumbnailProps) {
  const { canvasRef, loaded, error, canvasWidth, canvasHeight } =
    useVideoPortionFrameExtraction({
      videoUrl,
      time,
      size,
    });

  return (
    <canvas
      ref={canvasRef}
      width={canvasWidth}
      height={canvasHeight}
      className={cn(
        'rounded border border-border/50',
        size === 'large' ? 'w-full h-auto' : 'w-8 h-auto',
        !loaded && !error && 'bg-muted/30 animate-pulse',
        error && 'bg-destructive/20'
      )}
      style={
        size === 'large'
          ? { aspectRatio: `${canvasWidth} / ${canvasHeight}` }
          : undefined
      }
    />
  );
}
