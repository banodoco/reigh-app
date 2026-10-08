import React from 'react';
import { Music2 } from 'lucide-react';
import { Button } from '@/shared/components/ui/button';
import { bridgeMediaUrl } from '@/shared/lib/media/bridgeMediaUrl';
import { getProjectSelectionFallbackId } from '@/shared/contexts/projectSelectionStore';
import { getMediaUrl } from '@/shared/lib/media/mediaTypeHelpers';
import type { GeneratedImageWithMetadata } from '../../MediaGallery/types';

interface AudioContentProps {
  image: GeneratedImageWithMetadata;
  shouldLoad: boolean;
  onOpenLightbox: (image: GeneratedImageWithMetadata) => void;
  onLoaded: () => void;
}

export function AudioContent({ image, shouldLoad, onOpenLightbox, onLoaded }: AudioContentProps) {
  const mediaUrl = getMediaUrl(image);
  const src = mediaUrl ? bridgeMediaUrl(getProjectSelectionFallbackId(), mediaUrl) : undefined;
  const name = image.name || image.local_file_name || 'Audio';

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 py-10">
      <Button variant="ghost" className="max-w-full gap-2" onClick={() => onOpenLightbox(image)} aria-label={`Open audio: ${name}`}>
        <Music2 className="h-5 w-5 shrink-0" aria-hidden="true" />
        <span className="truncate">{name}</span>
      </Button>
      <audio
        key={src}
        src={src}
        controls
        preload={shouldLoad ? 'metadata' : 'none'}
        aria-label={name}
        className="w-full h-9"
        onLoadedMetadata={onLoaded}
        onPointerDown={(event) => event.stopPropagation()}
        onPointerUp={(event) => event.stopPropagation()}
        onTouchStart={(event) => event.stopPropagation()}
        onTouchEnd={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}
      />
    </div>
  );
}
