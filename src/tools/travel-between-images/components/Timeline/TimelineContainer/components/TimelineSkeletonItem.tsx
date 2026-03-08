import React from 'react';
import { Loader2 } from 'lucide-react';
import { TIMELINE_PADDING_OFFSET } from '../../constants';
import { getProjectAspectRatioStyle } from '@/shared/lib/media/imageAspectRatio';

interface TimelineSkeletonItemProps {
  framePosition: number;
  fullMin: number;
  fullRange: number;
  containerWidth: number;
  projectAspectRatio?: string;
}

/** Skeleton placeholder shown while an image is being uploaded/added to timeline */
export const TimelineSkeletonItem: React.FC<TimelineSkeletonItemProps> = ({
  framePosition,
  fullMin,
  fullRange,
  containerWidth,
  projectAspectRatio,
}) => {
  const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
  const pixelPosition = TIMELINE_PADDING_OFFSET + ((framePosition - fullMin) / fullRange) * effectiveWidth;
  const leftPercent = (pixelPosition / containerWidth) * 100;

  const aspectRatioStyle = getProjectAspectRatioStyle(projectAspectRatio);

  return (
    <div
      style={{
        position: 'absolute',
        left: `${leftPercent}%`,
        top: '50%',
        transform: 'translate(-50%, -50%)',
        transition: 'left 0.2s ease-out',
        zIndex: 5,
        pointerEvents: 'none',
      }}
    >
       <div
        className="relative border-2 border-primary/20 rounded-lg overflow-hidden bg-muted/50"
        style={{
          width: '120px',
          maxHeight: '120px',
          ...aspectRatioStyle,
        }}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
           <Loader2 className="h-6 w-6 text-primary/60 animate-spin" />
        </div>
      </div>
    </div>
  );
};
