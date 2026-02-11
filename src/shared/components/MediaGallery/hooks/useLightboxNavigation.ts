import { useCallback, useRef } from 'react';
import type { GeneratedImageWithMetadata } from '../types';

interface UseLightboxNavigationParams {
  activeLightboxMedia: GeneratedImageWithMetadata | null;
  filteredImages: GeneratedImageWithMetadata[];
  isServerPagination: boolean;
  serverPage: number | undefined;
  totalPages: number;
  onServerPageChange?: (page: number) => void;
  handleOpenLightbox: (image: GeneratedImageWithMetadata) => void;
  setPendingLightboxTarget: (target: 'first' | 'last' | null) => void;
}

/**
 * Manages lightbox navigation (next/previous/go-to-index) including
 * cross-page navigation for server-paginated galleries.
 *
 * Uses a ref to read the latest values, so the returned callbacks are stable.
 */
export function useLightboxNavigation({
  activeLightboxMedia,
  filteredImages,
  isServerPagination,
  serverPage,
  totalPages,
  onServerPageChange,
  handleOpenLightbox,
  setPendingLightboxTarget,
}: UseLightboxNavigationParams) {
  // Ref keeps latest values so callbacks never go stale
  const dataRef = useRef({
    activeLightboxMedia,
    filteredImages,
    isServerPagination,
    serverPage,
    totalPages,
  });

  dataRef.current = {
    activeLightboxMedia,
    filteredImages,
    isServerPagination,
    serverPage,
    totalPages,
  };

  // Track when we set a pending target (for cross-page navigation)
  const pendingTargetSetTimeRef = useRef<number | null>(null);

  const handleNextImage = useCallback(() => {
    const { activeLightboxMedia: media, filteredImages: images, isServerPagination: isServer, serverPage: page, totalPages: total } = dataRef.current;
    if (!media) return;
    const currentIndex = images.findIndex(img => img.id === media.id);

    if (isServer) {
      if (currentIndex < images.length - 1) {
        handleOpenLightbox(images[currentIndex + 1]);
      } else {
        const p = page || 1;
        if (p < total && onServerPageChange) {
          pendingTargetSetTimeRef.current = Date.now();
          setPendingLightboxTarget('first');
          onServerPageChange(p + 1);
        }
      }
    } else {
      if (currentIndex < images.length - 1) {
        handleOpenLightbox(images[currentIndex + 1]);
      }
    }
  }, [handleOpenLightbox, setPendingLightboxTarget, onServerPageChange]);

  const handlePreviousImage = useCallback(() => {
    const { activeLightboxMedia: media, filteredImages: images, isServerPagination: isServer, serverPage: page } = dataRef.current;
    if (!media) return;
    const currentIndex = images.findIndex(img => img.id === media.id);

    if (isServer) {
      if (currentIndex > 0) {
        handleOpenLightbox(images[currentIndex - 1]);
      } else {
        const p = page || 1;
        if (p > 1 && onServerPageChange) {
          pendingTargetSetTimeRef.current = Date.now();
          setPendingLightboxTarget('last');
          onServerPageChange(p - 1);
        }
      }
    } else {
      if (currentIndex > 0) {
        handleOpenLightbox(images[currentIndex - 1]);
      }
    }
  }, [handleOpenLightbox, setPendingLightboxTarget, onServerPageChange]);

  const handleSetActiveLightboxIndex = useCallback((index: number) => {
    const { filteredImages: images } = dataRef.current;
    if (index >= 0 && index < images.length) {
      handleOpenLightbox(images[index]);
    }
  }, [handleOpenLightbox]);

  return {
    handleNextImage,
    handlePreviousImage,
    handleSetActiveLightboxIndex,
    pendingTargetSetTimeRef,
  };
}
