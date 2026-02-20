/**
 * CRITICAL RACE CONDITION FIXES IMPLEMENTED:
 * 
 * 1. Session Management: Each loading session has a unique ID and AbortController
 * 2. Proper Cancellation: All timeouts and operations are properly canceled when superseded
 * 3. Reconciliation Tracking: Uses reconciliation IDs to prevent stale state updates
 * 4. Safe State Updates: All setState calls check if the session is still active
 * 5. Memory Leak Prevention: Comprehensive cleanup on unmount and session changes
 * 
 * This addresses the mobile stalling issues caused by competing progressive loading sessions.
 */

import React, { useState, useEffect, useRef } from 'react';
import { hasLoadedImage } from '@/shared/lib/preloading';
import { createSessionId } from '@/shared/lib/sessionId';

interface ImageWithId {
  id: string;
  url?: string;
  thumbUrl?: string;
  [key: string]: unknown;
}

interface UseProgressiveImageLoadingProps {
  images: ImageWithId[];
  page: number;
  enabled?: boolean;
  onImagesReady?: () => void; // Callback when first batch is ready
  isMobile: boolean; // Mobile context for adaptive behavior
  useIntersectionObserver?: boolean; // Optional: use intersection observer for lazy loading
  isLightboxOpen?: boolean; // Pause loading when lightbox is open
  instanceId?: string; // Unique instance ID to prevent state conflicts
}

// Session management for proper cleanup and race condition prevention
interface LoadingSession {
  id: string;
  abortController: AbortController;
  timeouts: (NodeJS.Timeout | number)[];
  rafIds: number[]; // requestAnimationFrame handles
  isActive: boolean;
  startTime: number;
}

export const useProgressiveImageLoading = ({ 
  images, 
  page, 
  enabled = true,
  onImagesReady,
  isMobile,
  useIntersectionObserver = true, // Enable by default for better mobile performance
  isLightboxOpen = false, // Pause loading when lightbox is open
}: UseProgressiveImageLoadingProps) => {
  const [showImageIndices, setShowImageIndices] = useState<Set<number>>(new Set());
  const currentPageRef = useRef(page);
  const lastTriggerTimeRef = useRef<number>(0);
  const activeSessionRef = useRef<LoadingSession | null>(null);
  const reconciliationIdRef = useRef<number>(0);
  
  // Create a stable identifier for the image set to detect changes
  // This prevents the bug where server pagination with same-length pages wouldn't trigger
  // Include page number to ensure uniqueness across pages, and use first/last images for better coverage
  const imageSetId = React.useMemo(() => {
    if (images.length === 0) return `empty-${page}`;
    // Use first 2 and last 1 image IDs plus page number for better uniqueness
    // This ensures different pages are detected even if they share some images
    const firstIds = images.slice(0, 2).map(img => img?.id).join(',');
    const lastId = images.length > 2 ? images[images.length - 1]?.id : '';
    return `${page}-${firstIds}-${lastId}`;
  }, [images, page]);
  
  // Helper function to safely cancel a loading session
  const cancelActiveSession = (_reason: string) => {
    if (activeSessionRef.current?.isActive) {
      // Abort any ongoing operations
      activeSessionRef.current.abortController.abort();

      // Clear all timeouts
      activeSessionRef.current.timeouts.forEach(timeout => clearTimeout(timeout));

      // Cancel all requestAnimationFrame handles
      activeSessionRef.current.rafIds.forEach(rafId => cancelAnimationFrame(rafId));

      // Mark as inactive
      activeSessionRef.current.isActive = false;
      activeSessionRef.current = null;
    }
  };

  // Stabilize onImagesReady reference to prevent effect re-runs
  const stableOnImagesReady = useRef(onImagesReady);
  useEffect(() => {
    stableOnImagesReady.current = onImagesReady;
  }, [onImagesReady]);

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastTrigger = now - lastTriggerTimeRef.current;
    
    if (!enabled || images.length === 0 || isLightboxOpen) {
      // Call onImagesReady even for empty images to clear loading states
      if (images.length === 0 && stableOnImagesReady.current) {
        stableOnImagesReady.current();
      }
      cancelActiveSession('disabled, no images, or lightbox open');
      return;
    }
    
    // Prevent rapid re-triggers (debounce for 50ms unless it's a page change)
    const prevPage = currentPageRef.current;
    const isPageChange = prevPage !== page;
    if (!isPageChange && timeSinceLastTrigger < 50) {
      return;
    }

    // Cancel any previous session before starting new one
    cancelActiveSession('new session starting');
    
    lastTriggerTimeRef.current = now;
    reconciliationIdRef.current += 1;
    const currentReconciliationId = reconciliationIdRef.current;

    // Create new loading session with proper cancellation support
    const sessionId = createSessionId('prog');
    const abortController = new AbortController();
    const timeouts: (NodeJS.Timeout | number)[] = [];
    const rafIds: number[] = [];

    const session: LoadingSession = {
      id: sessionId,
      abortController,
      timeouts,
      rafIds,
      isActive: true,
      startTime: now
    };
    
    activeSessionRef.current = session;
    currentPageRef.current = page;
    
    // Helper to check if this session is still active
    const isSessionActive = () => {
      return activeSessionRef.current?.id === sessionId && 
             activeSessionRef.current?.isActive && 
             !abortController.signal.aborted &&
             currentReconciliationId === reconciliationIdRef.current;
    };

    // Helper to safely update state if session is still active
    const safeSetShowImageIndices = (updater: (prev: Set<number>) => Set<number>) => {
      if (isSessionActive()) {
        setShowImageIndices(updater);
        return true;
      }
      return false;
    };

    // Show all images immediately
    const allIndices = new Set<number>();
    for (let i = 0; i < images.length; i++) {
      allIndices.add(i);
    }
    
    // Set all immediately
    if (!safeSetShowImageIndices(() => allIndices)) {
      return; // Session was canceled during setup
    }
    
    // Optimized cache check: batch check all images at once instead of individual calls
    // This is more efficient for pages with many images (especially later pages)

    // Use a single pass to check cache status
    for (const img of images) {
      if (hasLoadedImage(img)) {
        // Image is cached
      } else {
        // Early exit optimization: if we find uncached images, we know allCached is false
        // But continue counting for logging purposes
      }
    }
      
    // Notify that images are ready (for skeleton cleanup etc)
    // NOTE: Navigation clearing is now handled by actual image onLoad events in MediaGalleryGrid
    if (stableOnImagesReady.current && isSessionActive()) {
      // Use double rAF to wait for React to commit and browser to paint
      const rafId1 = requestAnimationFrame(() => {
        if (!isSessionActive()) return;
        const rafId2 = requestAnimationFrame(() => {
          if (isSessionActive()) {
            stableOnImagesReady.current?.();
          }
        });
        rafIds.push(rafId2);
      });
      rafIds.push(rafId1);
    }
    
    // Cleanup function that runs when dependencies change or component unmounts
    return () => {
      if (activeSessionRef.current?.id === sessionId) {
        cancelActiveSession('effect cleanup');
      }
    };
  }, [imageSetId, page, enabled, isMobile, useIntersectionObserver, isLightboxOpen, images]);
  
  // Cleanup on unmount - ensure all sessions are properly canceled
  useEffect(() => {
    return () => {
      cancelActiveSession('component unmount');
    };
  }, []);

  return { showImageIndices };
};
