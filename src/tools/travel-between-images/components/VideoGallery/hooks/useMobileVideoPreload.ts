import React, { useState, useRef, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';
import { getDisplayUrl } from '@/shared/lib/mediaUrl';

// TypeScript declaration for global mobile video preload map
declare global {
  interface Window {
    mobileVideoPreloadMap?: Map<number, () => void>;
  }
}

/**
 * Hook to handle mobile video preloading via hidden <video> elements.
 * Creates a preload video element on first tap and exposes the preload function
 * to the parent via a global map keyed by originalIndex.
 */
export function useMobileVideoPreload(
  video: GenerationRow,
  originalIndex: number,
  isMobile: boolean,
  onMobilePreload: ((index: number) => void) | undefined
): { isMobilePreloading: boolean } {
  const [isMobilePreloading, setIsMobilePreloading] = useState(false);
  const preloadVideoRef = useRef<HTMLVideoElement | null>(null);

  const startMobileVideoPreload = React.useCallback(() => {
    if (!isMobile || isMobilePreloading || preloadVideoRef.current) {
      return;
    }

    setIsMobilePreloading(true);

    // Create hidden video element for preloading
    const preloadVideo = document.createElement('video');
    const resolvedSrc = getDisplayUrl((video.location || video.imageUrl || '') as string);
    preloadVideo.src = resolvedSrc;
    preloadVideo.preload = 'auto';
    preloadVideo.muted = true;
    preloadVideo.playsInline = true;
    preloadVideo.style.display = 'none';
    preloadVideo.style.position = 'absolute';
    preloadVideo.style.top = '-9999px';
    preloadVideo.style.left = '-9999px';

    // Log errors for debugging
    const handleError = () => {
    };

    preloadVideo.addEventListener('error', handleError);

    // Store ref and append to DOM (hidden)
    preloadVideoRef.current = preloadVideo;
    document.body.appendChild(preloadVideo);

    // Cleanup function
    const cleanup = () => {
      if (preloadVideoRef.current) {
        preloadVideoRef.current.removeEventListener('error', handleError);
        if (preloadVideoRef.current.parentNode) {
          preloadVideoRef.current.parentNode.removeChild(preloadVideoRef.current);
        }
        preloadVideoRef.current = null;
      }
    };

    // Auto-cleanup after 30 seconds if video not opened
    const timeoutId = setTimeout(() => {
      cleanup();
      setIsMobilePreloading(false);
    }, 30000);

    // Store cleanup function for manual cleanup
    preloadVideo.dataset.cleanupTimeoutId = timeoutId.toString();

    return cleanup;
  }, [isMobile, isMobilePreloading, video.location, video.imageUrl]);

  // Cleanup preload video on unmount or video change
  useEffect(() => {
    return () => {
      if (preloadVideoRef.current) {
        const timeoutId = preloadVideoRef.current.dataset.cleanupTimeoutId;
        if (timeoutId) {
          clearTimeout(parseInt(timeoutId));
        }
        if (preloadVideoRef.current.parentNode) {
          preloadVideoRef.current.parentNode.removeChild(preloadVideoRef.current);
        }
        preloadVideoRef.current = null;
      }
    };
  }, [video.location, video.imageUrl]);

  // Create stable preload handler for this video item
  const handleMobilePreload = React.useCallback(() => {
    startMobileVideoPreload();
  }, [startMobileVideoPreload]);

  // Expose preload function to parent via global map keyed by originalIndex
  React.useEffect(() => {
    if (onMobilePreload) {
      if (!window.mobileVideoPreloadMap) {
        window.mobileVideoPreloadMap = new Map();
      }
      window.mobileVideoPreloadMap.set(originalIndex, handleMobilePreload);

      return () => {
        window.mobileVideoPreloadMap?.delete(originalIndex);
      };
    }
  }, [originalIndex, handleMobilePreload, onMobilePreload]);

  return { isMobilePreloading };
}
