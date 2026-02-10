import { useState, useCallback, useRef, useEffect } from 'react';
import { ImageTransform, DEFAULT_TRANSFORM } from './types';

interface UseImageTransformProps {
  /** Active variant ID or generation ID for cache key */
  activeVariantId?: string | null;
  /** Media/generation ID as fallback cache key */
  mediaId: string;
  /** Active variant's params - for loading saved transform data */
  activeVariantParams?: Record<string, unknown> | null;
}

interface UseImageTransformReturn {
  transform: ImageTransform;
  hasTransformChanges: boolean;
  setTranslateX: (value: number) => void;
  setTranslateY: (value: number) => void;
  setScale: (value: number) => void;
  setRotation: (value: number) => void;
  toggleFlipH: () => void;
  toggleFlipV: () => void;
  resetTransform: () => void;
  /** Get current cache key (for external cache management) */
  getCacheKey: () => string;
  /** Clear cache for a specific key */
  clearCacheForKey: (key: string) => void;
  /** Mark that next cache should be skipped (after saving) */
  markSkipNextCache: () => void;
}

/**
 * Hook for managing image transform state with per-variant caching.
 * Handles translateX/Y, scale, rotation, flipH/V with preservation across variant switches.
 */
export function useImageTransform({
  activeVariantId,
  mediaId,
  activeVariantParams,
}: UseImageTransformProps): UseImageTransformReturn {
  const [transform, setTransform] = useState<ImageTransform>(DEFAULT_TRANSFORM);

  // Track if user has made any transform changes
  const hasTransformChanges =
    transform.translateX !== 0 ||
    transform.translateY !== 0 ||
    transform.scale !== 1 ||
    transform.rotation !== 0 ||
    transform.flipH ||
    transform.flipV;

  // Per-variant transform cache (preserves transforms when switching variants)
  const transformCacheRef = useRef<Map<string, ImageTransform>>(new Map());
  // Flag to skip caching after save (transform is baked into image)
  const skipNextCacheRef = useRef(false);

  const getCacheKey = useCallback(() => {
    // Use variant ID if available, otherwise use generation ID
    return activeVariantId || mediaId;
  }, [activeVariantId, mediaId]);

  const prevCacheKeyRef = useRef(getCacheKey());

  // Cache transform when variant/media changes
  useEffect(() => {
    const currentCacheKey = getCacheKey();
    if (prevCacheKeyRef.current !== currentCacheKey) {
      // Save current transform for old variant/media (unless we just saved)
      if (prevCacheKeyRef.current && !skipNextCacheRef.current) {
        transformCacheRef.current.set(prevCacheKeyRef.current, transform);
      }
      // Reset the skip flag
      skipNextCacheRef.current = false;

      // Try to load transform in order of priority:
      // 1. From session cache (user's current edits)
      // 2. From variant params (only if explicitly saved as restorable transform)
      // 3. Default transform
      // Note: repositioned variants use 'transform_applied' (history only), not 'transform' (restorable)
      const cachedTransform = transformCacheRef.current.get(currentCacheKey);
      const savedTransform = activeVariantParams?.transform as ImageTransform | undefined;

      if (cachedTransform) {
        setTransform(cachedTransform);
      } else if (savedTransform && typeof savedTransform === 'object') {
        // Load saved transform from variant params
        setTransform({
          translateX: savedTransform.translateX ?? 0,
          translateY: savedTransform.translateY ?? 0,
          scale: savedTransform.scale ?? 1,
          rotation: savedTransform.rotation ?? 0,
          flipH: savedTransform.flipH ?? false,
          flipV: savedTransform.flipV ?? false,
        });
      } else {
        setTransform(DEFAULT_TRANSFORM);
      }

      prevCacheKeyRef.current = currentCacheKey;
    }
  }, [getCacheKey, transform, activeVariantParams]);

  // Individual transform setters
  const setTranslateX = useCallback((value: number) => {
    setTransform(prev => ({ ...prev, translateX: value }));
  }, []);

  const setTranslateY = useCallback((value: number) => {
    setTransform(prev => ({ ...prev, translateY: value }));
  }, []);

  const setScale = useCallback((value: number) => {
    setTransform(prev => ({ ...prev, scale: value }));
  }, []);

  const setRotation = useCallback((value: number) => {
    setTransform(prev => ({ ...prev, rotation: value }));
  }, []);

  const toggleFlipH = useCallback(() => {
    setTransform(prev => ({ ...prev, flipH: !prev.flipH }));
  }, []);

  const toggleFlipV = useCallback(() => {
    setTransform(prev => ({ ...prev, flipV: !prev.flipV }));
  }, []);

  // Reset transform to default
  const resetTransform = useCallback(() => {
    setTransform(DEFAULT_TRANSFORM);
  }, []);

  // Clear cache for a specific key
  const clearCacheForKey = useCallback((key: string) => {
    transformCacheRef.current.delete(key);
  }, []);

  // Mark that next cache should be skipped
  const markSkipNextCache = useCallback(() => {
    skipNextCacheRef.current = true;
  }, []);

  return {
    transform,
    hasTransformChanges,
    setTranslateX,
    setTranslateY,
    setScale,
    setRotation,
    toggleFlipH,
    toggleFlipV,
    resetTransform,
    getCacheKey,
    clearCacheForKey,
    markSkipNextCache,
  };
}
