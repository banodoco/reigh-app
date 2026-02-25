import { useEffect } from 'react';
import { getViewportLockRuntime } from '@/shared/runtime/viewportLockRuntime';

interface UseLightboxViewportLockArgs {
  isActuallyModal: boolean;
}

export function useLightboxViewportLock({ isActuallyModal }: UseLightboxViewportLockArgs): void {
  useEffect(() => {
    if (isActuallyModal) return;
    return getViewportLockRuntime().lockLightboxViewport();
  }, [isActuallyModal]);
}
