import { useEffect, useRef } from 'react';
import { TOOL_IDS } from '@/shared/lib/toolIds';

interface UseMediaGalleryDebugToolsOptions {
  currentToolType?: string;
  filtersMediaType?: string;
  defaultFiltersMediaType?: string;
  imagesLength: number;
  isMobile: boolean;
}

export function useMediaGalleryDebugTools(options: UseMediaGalleryDebugToolsOptions): void {
  const {
    currentToolType,
    filtersMediaType,
    defaultFiltersMediaType,
    imagesLength,
    isMobile,
  } = options;

  const videoGalleryDebugRef = useRef({ lastImagesLength: 0 });

  useEffect(() => {
    if (!import.meta.env.DEV) {
      return;
    }

    const mediaType = filtersMediaType ?? defaultFiltersMediaType ?? 'all';
    const isVideoGallery = currentToolType === TOOL_IDS.TRAVEL_BETWEEN_IMAGES && mediaType === 'video';
    if (!isVideoGallery) {
      return;
    }

    if (videoGalleryDebugRef.current.lastImagesLength !== imagesLength) {
      videoGalleryDebugRef.current.lastImagesLength = imagesLength;
    }
  }, [currentToolType, defaultFiltersMediaType, filtersMediaType, imagesLength]);

  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
      return;
    }

    window.debugMobile = () => {
      const freshIsMobile = window.innerWidth < 768;
      return {
        isMobile: freshIsMobile,
        hookReportedMobile: isMobile,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        touchSupported: 'ontouchstart' in window,
      };
    };

    return () => {
      delete window.debugMobile;
    };
  }, [isMobile]);
}
