/**
 * Progressive Image Loading Hook
 * 
 * Manages thumbnail → full resolution image loading for individual images.
 * Shows thumbnail immediately, loads full image in background, then transitions smoothly.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { hasLoadedImage, markImageLoaded } from '@/shared/lib/preloading';

type ImagePhase = 'idle' | 'thumb' | 'loadingFull' | 'full' | 'error';

interface UseProgressiveImageOptions {
  priority?: boolean; // Load immediately without intersection observer
  lazy?: boolean; // Use intersection observer for lazy loading
  crossfadeMs?: number; // Crossfade duration in milliseconds
  prefetch?: boolean; // Prefetch full image without showing
  ioRootMargin?: string; // Intersection observer root margin
  enabled?: boolean; // Enable/disable progressive loading
}

interface UseProgressiveImageResult {
  src: string;
  phase: ImagePhase;
  isThumbShowing: boolean;
  isFullLoaded: boolean;
  error: string | null;
  retry: () => void;
  ref: (element: HTMLElement | null) => void;
}

interface LoadingSession {
  id: string;
  abortController: AbortController;
  timeouts: (NodeJS.Timeout | number)[];
  isActive: boolean;
}

export const useProgressiveImage = (
  thumbUrl?: string | null,
  fullUrl?: string | null,
  options: UseProgressiveImageOptions = {}
): UseProgressiveImageResult => {
  const {
    priority = false,
    lazy = true,
    crossfadeMs = 180,
    prefetch = false,
    ioRootMargin = '200px',
    enabled = true
  } = options;

  const [phase, setPhase] = useState<ImagePhase>('idle');
  const [currentSrc, setCurrentSrc] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isIntersecting, setIsIntersecting] = useState(!lazy || priority);

  const activeSessionRef = useRef<LoadingSession | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const retryCountRef = useRef(0);
  const phaseRef = useRef<ImagePhase>('idle'); // Ref for logging without causing re-renders

  // Keep phaseRef in sync with phase state
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Helper function to cancel active session
  const cancelActiveSession = useCallback((reason: string) => {
    if (activeSessionRef.current?.isActive) {
      console.log(`[ThumbToFullTransition] ⚠️ Canceling session:`, {
        sessionId: activeSessionRef.current.id,
        reason,
        currentPhase: phaseRef.current, // Use ref instead of state to avoid dependency
        timestamp: Date.now()
      });
      activeSessionRef.current.abortController.abort();
      activeSessionRef.current.timeouts.forEach(timeout => clearTimeout(timeout));
      activeSessionRef.current.isActive = false;
      activeSessionRef.current = null;
    }
  }, []); // No dependencies - stable function reference

  // Helper function to create new session
  const createSession = useCallback((): LoadingSession => {
    const sessionId = `prog-img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const abortController = new AbortController();
    const timeouts: (NodeJS.Timeout | number)[] = [];
    
    const session: LoadingSession = {
      id: sessionId,
      abortController,
      timeouts,
      isActive: true
    };
    
    activeSessionRef.current = session;
    return session;
  }, []);

  // Helper function to check if session is still active
  const isSessionActive = useCallback((session: LoadingSession) => {
    return activeSessionRef.current?.id === session.id && 
           activeSessionRef.current?.isActive && 
           !session.abortController.signal.aborted;
  }, []);

  // Helper function to safely update state
  const safeSetState = useCallback((session: LoadingSession, updater: () => void) => {
    if (isSessionActive(session)) {
      updater();
      return true;
    }
    return false;
  }, [isSessionActive]);

  // Helper function to load an image
  const loadImage = useCallback((url: string, session: LoadingSession): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      if (!isSessionActive(session)) {
        reject(new Error('Session cancelled'));
        return;
      }

      const img = new Image();
      
      const cleanup = () => {
        img.onload = null;
        img.onerror = null;
        img.onabort = null;
      };

      img.onload = () => {
        cleanup();
        if (isSessionActive(session)) {
          markImageLoaded(url);
          resolve(img);
        } else {
          reject(new Error('Session cancelled during load'));
        }
      };

      img.onerror = () => {
        cleanup();
        reject(new Error(`Failed to load image: ${url}`));
      };

      img.onabort = () => {
        cleanup();
        reject(new Error('Image load aborted'));
      };

      // Handle session abortion
      session.abortController.signal.addEventListener('abort', () => {
        cleanup();
        reject(new Error('Session aborted'));
      });

      img.src = url;
    });
  }, [isSessionActive]);

  // Setup intersection observer for lazy loading
  useEffect(() => {
    if (!lazy || priority || !enabled) {
      setIsIntersecting(true);
      return;
    }

    if (!elementRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          observerRef.current?.disconnect();
        }
      },
      { rootMargin: ioRootMargin }
    );

    observerRef.current.observe(elementRef.current);

    return () => {
      observerRef.current?.disconnect();
    };
  }, [lazy, priority, enabled, ioRootMargin]);

  // Main loading logic
  useEffect(() => {
    if (!enabled || !isIntersecting) {
      console.log('[ThumbToFullTransition] Skipping load:', {
        enabled,
        isIntersecting,
        thumbUrl: thumbUrl?.substring(0, 50),
        fullUrl: fullUrl?.substring(0, 50),
        timestamp: Date.now()
      });
      return;
    }

    console.log('[ThumbToFullTransition] 🚀 Starting progressive load:', {
      thumbUrl: thumbUrl?.substring(0, 50),
      fullUrl: fullUrl?.substring(0, 50),
      priority,
      lazy,
      enabled,
      timestamp: Date.now()
    });

    // Cancel any previous session
    cancelActiveSession('new loading session');
    
    // Reset error state
    setError(null);

    // Determine what to do based on available URLs
    const hasThumb = thumbUrl && thumbUrl !== fullUrl;
    const hasFull = !!fullUrl;

    console.log('[ThumbToFullTransition] URL analysis:', {
      hasThumb,
      hasFull,
      thumbEqualsFullUrl: thumbUrl === fullUrl,
      timestamp: Date.now()
    });

    if (!hasThumb && !hasFull) {
      console.log('[ThumbToFullTransition] No URLs available, staying idle');
      setPhase('idle');
      setCurrentSrc('');
      return;
    }

    const session = createSession();
    console.log('[ThumbToFullTransition] Created session:', session.id);

    // If no thumbnail or thumbnail equals full URL, load full directly
    if (!hasThumb) {
      console.log('[ThumbToFullTransition] No thumbnail, loading full image directly');
      if (hasFull) {
        safeSetState(session, () => {
          setPhase('loadingFull');
          setCurrentSrc('');
        });

        loadImage(fullUrl!, session)
          .then(() => {
            console.log('[ThumbToFullTransition] ✅ Full image loaded directly');
            safeSetState(session, () => {
              setPhase('full');
              setCurrentSrc(fullUrl!);
            });
          })
          .catch((err) => {
            // Only log non-abort errors (abort is expected during navigation)
            if (err.message !== 'Session aborted') {
            console.error('[ThumbToFullTransition] ❌ Full image load failed:', err.message);
            }
            safeSetState(session, () => {
              setPhase('error');
              setError(err.message);
            });
          });
      }
      return;
    }

    // Progressive loading: Load thumbnail FIRST, then full image
    console.log('[ThumbToFullTransition] 📸 Starting progressive load - Phase 1: Loading thumbnail');
    safeSetState(session, () => {
      setPhase('thumb');
      setCurrentSrc(''); // Don't show anything until thumbnail loads
    });

    // Step 1: Load thumbnail first
    loadImage(thumbUrl!, session)
      .then(() => {
        if (!isSessionActive(session)) {
          console.log('[ThumbToFullTransition] ⚠️ Session cancelled after thumbnail loaded');
          return;
        }

        console.log('[ThumbToFullTransition] ✅ Thumbnail loaded, displaying it now');
        // Show thumbnail once it's loaded
        safeSetState(session, () => {
          setCurrentSrc(thumbUrl!);
        });

        // If prefetch only, don't continue to full loading
        if (prefetch || !hasFull) {
          console.log('[ThumbToFullTransition] Stopping at thumbnail (prefetch mode or no full URL)');
          return;
        }

        // Step 2: Now start loading full image in background
        const isFullCached = hasLoadedImage(fullUrl!);
        console.log('[ThumbToFullTransition] 🔄 Phase 2: Starting full image load in background', {
          isFullCached,
          priority,
          willLoadImmediately: isFullCached || priority,
          timestamp: Date.now()
        });
        
        const loadFullImage = () => {
          console.log('[ThumbToFullTransition] 📥 Loading full image...');
          safeSetState(session, () => setPhase('loadingFull'));

          loadImage(fullUrl!, session)
            .then(() => {
              if (!isSessionActive(session)) {
                console.log('[ThumbToFullTransition] ⚠️ Session cancelled after full image loaded');
                return;
              }

              console.log('[ThumbToFullTransition] ✅ Full image loaded successfully');
              // Smooth transition to full image
              if (crossfadeMs > 0) {
                console.log(`[ThumbToFullTransition] 🎬 Waiting ${crossfadeMs}ms before switching to full image`);
                const timeout = setTimeout(() => {
                  safeSetState(session, () => {
                    console.log('[ThumbToFullTransition] 🎉 Switching from thumbnail to full image!');
                    setPhase('full');
                    setCurrentSrc(fullUrl!);
                  });
                }, crossfadeMs);
                session.timeouts.push(timeout);
              } else {
                safeSetState(session, () => {
                  console.log('[ThumbToFullTransition] 🎉 Switching from thumbnail to full image (no crossfade)!');
                  setPhase('full');
                  setCurrentSrc(fullUrl!);
                });
              }
            })
            .catch((err) => {
              // Only log non-abort errors (abort is expected during navigation)
              if (err.message !== 'Session aborted') {
              console.error('[ThumbToFullTransition] ❌ Full image load failed:', err.message);
              }
              safeSetState(session, () => {
                setError(err.message);
                // Keep showing thumbnail on full image error
              });
            });
        };

        if (isFullCached || priority) {
          // Load immediately if cached or high priority
          console.log('[ThumbToFullTransition] Loading full image immediately (cached or priority)');
          loadFullImage();
        } else {
          // Small delay for non-cached images to let thumbnail render first
          console.log('[ThumbToFullTransition] Delaying full image load by 50ms to let thumbnail render');
          const timeout = setTimeout(loadFullImage, 50);
          session.timeouts.push(timeout);
        }
      })
      .catch((thumbErr) => {
        // Thumbnail failed to load - fall back to loading full image directly
        if (!isSessionActive(session)) {
          console.log('[ThumbToFullTransition] ⚠️ Session cancelled after thumbnail failed');
          return;
        }
        
        console.warn('[ThumbToFullTransition] ❌ Thumbnail failed to load, falling back to full image:', thumbErr.message);
        
        if (hasFull) {
          safeSetState(session, () => {
            setPhase('loadingFull');
            setCurrentSrc('');
          });

          console.log('[ThumbToFullTransition] 🔄 Attempting to load full image directly as fallback');
          loadImage(fullUrl!, session)
            .then(() => {
              console.log('[ThumbToFullTransition] ✅ Full image loaded as fallback');
              safeSetState(session, () => {
                setPhase('full');
                setCurrentSrc(fullUrl!);
              });
            })
            .catch((fullErr) => {
              console.error('[ThumbToFullTransition] ❌ Both thumbnail and full image failed:', fullErr.message);
              safeSetState(session, () => {
                setPhase('error');
                setError(`Both thumbnail and full image failed: ${fullErr.message}`);
              });
            });
        } else {
          console.error('[ThumbToFullTransition] ❌ Thumbnail failed and no full URL available');
          safeSetState(session, () => {
            setPhase('error');
            setError(`Thumbnail failed to load: ${thumbErr.message}`);
          });
        }
      });

    return () => {
      if (activeSessionRef.current?.id === session.id) {
        console.log('[ThumbToFullTransition] 🧹 Cleaning up session:', session.id);
        cancelActiveSession('effect cleanup');
      }
    };
  }, [
    enabled,
    isIntersecting,
    thumbUrl,
    fullUrl,
    priority,
    prefetch,
    crossfadeMs,
    loadImage,
    cancelActiveSession,
    createSession,
    safeSetState
  ]);

  // Retry function
  const retry = useCallback(() => {
    retryCountRef.current += 1;
    setError(null);
    
    // Trigger re-run of loading effect
    const currentSession = activeSessionRef.current;
    cancelActiveSession('retry');
    
    // Small delay to ensure cleanup completes
    setTimeout(() => {
      setIsIntersecting(true);
    }, 100);
  }, [cancelActiveSession]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelActiveSession('component unmount');
      observerRef.current?.disconnect();
    };
  }, [cancelActiveSession]);

  // Ref callback for intersection observer
  const setRef = useCallback((element: HTMLElement | null) => {
    elementRef.current = element;
  }, []);

  return {
    src: currentSrc,
    phase,
    isThumbShowing: phase === 'thumb' || (phase === 'loadingFull' && currentSrc === thumbUrl),
    isFullLoaded: phase === 'full',
    error,
    retry,
    ref: setRef
  };
};
