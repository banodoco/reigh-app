import React, { useRef, useState } from 'react';
import { Music2 } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/shared/components/ui/dialog';
import { Button } from '@/shared/components/ui/button';
import { bridgeMediaUrl } from '@/shared/lib/media/bridgeMediaUrl';
import { getMediaUrl } from '@/shared/lib/media/mediaTypeHelpers';
import { getProjectSelectionFallbackId } from '@/shared/contexts/projectSelectionStore';
import type { GenerationRow } from '@/domains/generation/types';
import type { LightboxFeatureFlags, LightboxNavigationProps } from './types';

interface AudioLightboxProps {
  media: GenerationRow;
  onClose: () => void;
  navigation?: LightboxNavigationProps;
  features?: LightboxFeatureFlags;
  customOverlay?: React.ReactNode;
}

export function AudioLightbox({ media, onClose, navigation, features, customOverlay }: AudioLightboxProps) {
  const [open, setOpen] = useState(true);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const mediaUrl = getMediaUrl(media);
  const src = mediaUrl ? bridgeMediaUrl(getProjectSelectionFallbackId(), mediaUrl) : undefined;
  const name = media.name || 'Audio';
  const navigate = (callback?: () => void) => {
    if (!callback) return;
    pendingNavigation.current = callback;
    setOpen(false);
  };
  const handleOpenChangeComplete = (isOpen: boolean) => {
    if (isOpen) return;
    const callback = pendingNavigation.current;
    pendingNavigation.current = null;
    if (callback) {
      // Release the dialog's modal scope before navigation can replace this
      // component with an image or video lightbox.
      callback();
      setOpen(true);
    } else {
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen} onOpenChangeComplete={handleOpenChangeComplete}>
      <DialogContent>
        <DialogTitle className="flex items-center gap-2 pr-6"><Music2 className="h-5 w-5" aria-hidden="true" />{name}</DialogTitle>
        <DialogDescription>Audio preview</DialogDescription>
        <div className="relative">
          <audio key={`${media.id}:${src}`} src={src} controls preload="metadata" aria-label={name} className="w-full" />
          {customOverlay}
        </div>
        <div className="flex items-center justify-between gap-2">
          {navigation?.showNavigation && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate(navigation.onPrevious)} disabled={!navigation.hasPrevious}>Previous</Button>
              <Button variant="outline" onClick={() => navigate(navigation.onNext)} disabled={!navigation.hasNext}>Next</Button>
            </div>
          )}
          {features?.showDownload !== false && src && <Button variant="outline" asChild><a href={src} download={name}>Download audio</a></Button>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
