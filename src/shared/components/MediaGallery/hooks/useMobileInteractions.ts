import { useCallback, useEffect } from 'react';
import { GeneratedImageWithMetadata } from '../MediaGallery';

export interface UseMobileInteractionsProps {
  isMobile: boolean;
  mobileActiveImageId: string | null;
  setMobileActiveImageId: (id: string | null) => void;
  mobilePopoverOpenImageId: string | null;
  setMobilePopoverOpenImageId: (id: string | null) => void;
  lastTouchTimeRef: React.MutableRefObject<number>;
  lastTappedImageIdRef: React.MutableRefObject<string | null>;
  doubleTapTimeoutRef: React.MutableRefObject<NodeJS.Timeout | null>;
  onOpenLightbox: (image: GeneratedImageWithMetadata) => void;
}

export interface UseMobileInteractionsReturn {
  handleMobileTap: (image: GeneratedImageWithMetadata) => void;
}

export const useMobileInteractions = ({
  isMobile,
  mobileActiveImageId,
  setMobileActiveImageId,
  mobilePopoverOpenImageId,
  setMobilePopoverOpenImageId,
  lastTouchTimeRef,
  lastTappedImageIdRef,
  doubleTapTimeoutRef,
  onOpenLightbox,
}: UseMobileInteractionsProps): UseMobileInteractionsReturn => {
  
  // Handle mobile double-tap detection
  // Using 400ms window for snappier, more reliable double-tap detection
  const DOUBLE_TAP_WINDOW_MS = 400;
  const MIN_TAP_INTERVAL_MS = 50; // Minimum time between taps to filter out accidental multi-touch
  
  const handleMobileTap = useCallback((image: GeneratedImageWithMetadata) => {
    const currentTime = Date.now();
    const timeSinceLastTap = currentTime - lastTouchTimeRef.current;
    const lastTappedImageId = lastTappedImageIdRef.current;
    const isSameImage = lastTappedImageId === image.id;
    
    if (timeSinceLastTap < DOUBLE_TAP_WINDOW_MS && timeSinceLastTap > MIN_TAP_INTERVAL_MS && lastTouchTimeRef.current > 0 && isSameImage) {
      // This is a double-tap on the same image, clear any pending timeout and open lightbox
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
        doubleTapTimeoutRef.current = null;
      }
      onOpenLightbox(image);
      // Reset tap tracking to prevent triple-tap issues
      lastTouchTimeRef.current = 0;
      lastTappedImageIdRef.current = null;
    } else {
      // This is a single tap or tap on different image, set a timeout to handle it if no second tap comes
      if (doubleTapTimeoutRef.current) {
        clearTimeout(doubleTapTimeoutRef.current);
      }
      doubleTapTimeoutRef.current = setTimeout(() => {
        // Single tap (mobile): reveal action controls for this image
        // Close any existing popover if tapping a different image
        if (mobilePopoverOpenImageId && mobilePopoverOpenImageId !== image.id) {
          setMobilePopoverOpenImageId(null);
        }
        setMobileActiveImageId(image.id);
        doubleTapTimeoutRef.current = null;
      }, DOUBLE_TAP_WINDOW_MS);
      
      // Update the last tapped image and time
      lastTappedImageIdRef.current = image.id;
      lastTouchTimeRef.current = currentTime;
    }
  }, [lastTouchTimeRef, lastTappedImageIdRef, doubleTapTimeoutRef, onOpenLightbox, mobilePopoverOpenImageId, setMobilePopoverOpenImageId, setMobileActiveImageId]);

  // Close mobile popover on scroll or when clicking outside
  useEffect(() => {
    if (!isMobile || !mobilePopoverOpenImageId) return;

    const handleScroll = () => {
      setMobilePopoverOpenImageId(null);
    };

    const handleClickOutside = (event: MouseEvent) => {
      // Close if clicking outside any popover content
      const target = event.target as Element;
      if (!target.closest('[data-popup]')) {
        setMobilePopoverOpenImageId(null);
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('mousedown', handleClickOutside);

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobile, mobilePopoverOpenImageId, setMobilePopoverOpenImageId]);

  return {
    handleMobileTap,
  };
};
