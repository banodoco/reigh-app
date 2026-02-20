import { useState, useCallback } from 'react';
import { GenerationRow } from '@/types/shots';

interface LightboxProps {
  images: GenerationRow[];
  shotId: string;
  isMobile?: boolean;
}

export function useLightbox({ images, isMobile = false }: LightboxProps) {
  
  // Lightbox state
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [autoEnterInpaint, setAutoEnterInpaint] = useState(false);

  // Navigation functions
  const goNext = useCallback(() => {
    setLightboxIndex(i => {
      if (i === null) return null;
      return (i + 1) % images.length;
    });
  }, [images.length]);

  const goPrev = useCallback(() => {
    setLightboxIndex(i => {
      if (i === null) return null;
      return (i - 1 + images.length) % images.length;
    });
  }, [images.length]);

  const openLightbox = useCallback((index: number) => {
    if (index >= 0 && index < images.length) {
      setLightboxIndex(index);
    }
  }, [images]);

  const openLightboxWithInpaint = useCallback((index: number) => {
    if (index >= 0 && index < images.length) {
      setAutoEnterInpaint(true);
      setLightboxIndex(index);
    }
  }, [images]);

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
    setAutoEnterInpaint(false); // Reset auto-enter flag when closing
  }, []);

  // Handle mobile tap - called by the "Open" button in TimelineItem when selected
  const handleMobileTap = useCallback((idx: number) => {
    if (!isMobile) return;
    openLightbox(idx);
  }, [isMobile, openLightbox]);

  // Desktop double-click handler
  const handleDesktopDoubleClick = useCallback((idx: number) => {
    if (isMobile) return;
    openLightbox(idx);
  }, [isMobile, openLightbox]);

  // Get current lightbox image
  const currentLightboxImage = lightboxIndex !== null ? images[lightboxIndex] : null;

  // Navigation availability
  const hasNext = lightboxIndex !== null && lightboxIndex < images.length - 1;
  const hasPrevious = lightboxIndex !== null && lightboxIndex > 0;
  const showNavigation = images.length > 1;

  return {
    // State
    lightboxIndex,
    setLightboxIndex, // Expose raw setter for external hooks
    currentLightboxImage,
    autoEnterInpaint,
    
    // Navigation
    goNext,
    goPrev,
    openLightbox,
    openLightboxWithInpaint,
    closeLightbox,
    
    // Event handlers
    handleMobileTap,
    handleDesktopDoubleClick,
    
    // Navigation state
    hasNext,
    hasPrevious,
    showNavigation
  };
}
