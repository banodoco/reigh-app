import type { MutableRefObject } from 'react';
import type { PreviewSegment } from './PreviewTogetherTypes';

interface PreviewTogetherThumbnailsProps {
  previewableSegments: PreviewSegment[];
  safeIndex: number;
  previewThumbnailsRef: MutableRefObject<HTMLDivElement | null>;
  onSelectSegment: (segmentIndex: number) => void;
}

export function PreviewTogetherThumbnails({
  previewableSegments,
  safeIndex,
  previewThumbnailsRef,
  onSelectSegment,
}: PreviewTogetherThumbnailsProps) {
  return (
    <div
      ref={previewThumbnailsRef}
      className="overflow-x-auto w-full no-scrollbar"
    >
      <div className="flex gap-2 p-3">
        {previewableSegments.map((segment, idx) => (
          <button
            key={idx}
            type="button"
            className={`relative flex-shrink-0 transition-all duration-200 rounded-lg overflow-hidden ${
              idx === safeIndex
                ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                : 'opacity-60 hover:opacity-100'
            }`}
            style={{ width: 64, height: 36 }}
            onClick={() => onSelectSegment(idx)}
            aria-label={`Go to segment ${segment.index + 1}`}
          >
            <img
              src={segment.thumbUrl || segment.startImageUrl || ''}
              alt={`Segment ${segment.index + 1}`}
              className="w-full h-full object-cover"
            />
            {!segment.hasVideo && (
              <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                <span className="text-[8px] text-white">IMG</span>
              </div>
            )}
            <span className="absolute bottom-0.5 right-1 text-[10px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
              {segment.index + 1}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
