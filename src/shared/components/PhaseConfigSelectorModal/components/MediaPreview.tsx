import React from 'react';
import { useIsMobile } from '@/shared/hooks/use-mobile';
import HoverScrubVideo from '@/shared/components/HoverScrubVideo';

export interface MediaPreviewProps {
  url: string;
  type: 'image' | 'video';
  alt?: string;
  className?: string;
  height?: string;
  objectFit?: 'cover' | 'contain';
  enableMobileTap?: boolean;
}

export const MediaPreview: React.FC<MediaPreviewProps> = ({
  url,
  type,
  alt,
  className = '',
  height = 'h-24',
  objectFit = 'cover',
  enableMobileTap = false,
}) => {
  const isMobile = useIsMobile();

  const handleMobileVideoTap = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isMobile || !enableMobileTap) return;
    const video = (e.currentTarget as HTMLElement).querySelector('video');
    if (video) {
      if (video.paused) {
        video.play().catch(() => {});
      } else {
        video.pause();
      }
    }
  };

  if (type === 'video') {
    return (
      <div
        className={`relative ${height} w-full ${className}`}
        onClick={enableMobileTap ? handleMobileVideoTap : undefined}
        onTouchEnd={enableMobileTap ? handleMobileVideoTap : undefined}
      >
        <HoverScrubVideo
          src={url}
          className="h-full w-full"
          videoClassName={`object-${objectFit}`}
          autoplayOnHover={!isMobile}
          preload="metadata"
          loop
          muted
        />
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt || 'Media'}
      className={`${height} w-auto object-${objectFit} rounded border p-0.5 ${className}`}
      loading="lazy"
    />
  );
};

export default MediaPreview;
