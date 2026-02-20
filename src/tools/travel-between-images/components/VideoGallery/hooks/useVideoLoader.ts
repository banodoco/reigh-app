import { useState, useRef, useCallback, useEffect } from 'react';
import { GenerationRow } from '@/types/shots';

/**
 * Hook to manage video loading state and lifecycle
 * Simplified: all videos load immediately with preload='metadata'
 * Browser handles concurrent requests efficiently
 */
export const useVideoLoader = (
  _video: GenerationRow,
  _index: number,
  _shouldPreload: string
) => {
  // Simplified: all videos load immediately
  const [shouldLoad] = useState(true);
  const [videoMetadataLoaded, setVideoMetadataLoaded] = useState(false);
  const [videoPosterLoaded, setVideoPosterLoaded] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const posterFallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const logVideoEvent = useCallback((_phase: string, _extraData: Record<string, unknown> = {}) => {
    // Logging removed - too verbose
  }, []);

  const clearPosterFallbackTimeout = useCallback(() => {
    const timeoutId = posterFallbackTimeoutRef.current;
    if (timeoutId) {
      clearTimeout(timeoutId);
      posterFallbackTimeoutRef.current = null;
    }
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return clearPosterFallbackTimeout;
  }, [clearPosterFallbackTimeout]);

  return {
    shouldLoad,
    videoMetadataLoaded,
    setVideoMetadataLoaded,
    videoPosterLoaded,
    setVideoPosterLoaded,
    videoRef,
    posterFallbackTimeoutRef,
    logVideoEvent
  };
};
