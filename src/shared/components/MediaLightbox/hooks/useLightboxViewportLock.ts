import { useEffect } from 'react';
import { getViewportLockRuntime } from '@/shared/runtime/viewportLockRuntime';
import { acquireLightboxOpenState } from '@/shared/components/MediaLightbox/state/lightboxOpenState';

interface UseLightboxViewportLockArgs {
  isActuallyModal: boolean;
}

export function useLightboxViewportLock({ isActuallyModal }: UseLightboxViewportLockArgs): void {
  useEffect(() => {
    if (isActuallyModal) return;
    const releaseLightboxOpen = acquireLightboxOpenState();
    const unlockViewport = getViewportLockRuntime().lockLightboxViewport();

    return () => {
      unlockViewport();
      releaseLightboxOpen();
    };
  }, [isActuallyModal]);
}
