import React, { useRef, useEffect, useState, useCallback } from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { getDisplayUrl, stripQueryParameters } from '@/shared/lib/media/mediaUrl';
import { useIsMobile } from '@/shared/hooks/mobile';
import { useVideoScrubbing } from '@/shared/hooks/useVideoScrubbing';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { safePlay } from '@/shared/lib/media/safePlay';
import { HoverScrubVideoOverlays } from '@/shared/components/HoverScrubVideo/HoverScrubVideoOverlays';

interface HoverScrubVideoProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onTouchEnd' | 'onLoadStart' | 'onLoadedData'> {
  /**
   * Source URL for the video. Can be a full URL or relative path handled by getDisplayUrl.
   */
  src: string;
  poster?: string;
  className?: string;
  /**
   * Extra className applied to the underlying <video> element.
   */
  videoClassName?: string;
  /**
   * Loop the video (defaults to true).
   */
  loop?: boolean;
  /**
   * Mute the video (defaults to true).
   */
  muted?: boolean;
  /**
   * Handle double-click events (desktop only).
   */
  onDoubleClick?: () => void;
  /**
   * Handle touch end events (mobile only).
   */
  onTouchEnd?: (e: React.TouchEvent<HTMLVideoElement>) => void;
  preload?: 'auto' | 'metadata' | 'none';
  showSpeedControls?: boolean;
  showNativeControls?: boolean;
  speedControlsPosition?: 'top-left' | 'bottom-center';
  /**
   * Disable scrubbing behavior for lightbox/fullscreen usage (defaults to false).
   */
  disableScrubbing?: boolean;
  /**
   * Load video content on demand (first hover/interaction) for better performance
   */
  loadOnDemand?: boolean;
  /**
   * Lightweight thumbnail mode: disables scrubbing and heavy listeners/logging,
   * uses preload="none" for minimal overhead. Ideal for small previews.
   */
  thumbnailMode?: boolean;
  /**
   * Autoplays video on hover, disabling scrubbing (defaults to false).
   */
  autoplayOnHover?: boolean;
  /**
   * If true, do not set video src until user interaction. Only the poster is shown.
   */
  posterOnlyUntilClick?: boolean;
  /**
   * When true, toggle play/pause on click (helpful on mobile where hover is absent)
   */
  playOnClick?: boolean;
  onVideoError?: React.ReactEventHandler<HTMLVideoElement>;
  onLoadStart?: React.ReactEventHandler<HTMLVideoElement>;
  onLoadedData?: React.ReactEventHandler<HTMLVideoElement>;
}

/**
 * Video component that scrubs based on mouse position and plays when mouse stops moving.
 */
const HoverScrubVideo: React.FC<HoverScrubVideoProps> = ({
  src,
  poster,
  className,
  videoClassName,
  loop = true,
  muted = true,
  onDoubleClick,
  onTouchEnd,
  preload: preloadProp = 'metadata',
  showSpeedControls = false,
  showNativeControls = false,
  speedControlsPosition = 'top-left',
  disableScrubbing = false,
  loadOnDemand = false,
  thumbnailMode = false,
  autoplayOnHover = false,
  posterOnlyUntilClick = false,
  playOnClick: _playOnClick = false,
  onVideoError,
  onLoadStart,
  onLoadedData,
  ...rest
}) => {
  const isMobile = useIsMobile();

  // Determine if scrubbing should be enabled
  const scrubbingEnabled = !isMobile && !disableScrubbing && !thumbnailMode && !autoplayOnHover;

  // Use the shared scrubbing hook for core scrubbing behavior
  const scrubbing = useVideoScrubbing({
    enabled: scrubbingEnabled,
    playOnStopScrubbing: true,
    playDelay: 400,
    resetOnLeave: true,
  });
  const handleScrubMouseMove = scrubbing.containerProps.onMouseMove;
  const handleScrubMouseEnter = scrubbing.containerProps.onMouseEnter;
  const handleScrubMouseLeave = scrubbing.containerProps.onMouseLeave;
  const handleScrubLoadedMetadata = scrubbing.videoProps.onLoadedMetadata;
  const resetScrubbing = scrubbing.reset;
  const setScrubVideoElement = scrubbing.setVideoElement;

  // Additional refs for features not covered by the hook
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  // Track whether a play was explicitly initiated by the user
  const userInitiatedPlayRef = useRef(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [hasLoadedOnDemand, setHasLoadedOnDemand] = useState(false);

  // Use hook's refs/state or fall back to local
  const containerRef = scrubbing.containerRef;
  const duration = scrubbing.duration;
  const scrubberPosition = scrubbing.scrubberPosition;
  const scrubberVisible = scrubbing.scrubberVisible;
  const isHoveringRef = useRef(false); // Keep for mobile autoplay prevention logic

  // Ref callback to connect video element to scrubbing hook immediately when mounted
  // Always connect regardless of scrubbingEnabled - the hook handles its own enabled state
  const videoRefCallback = useCallback((video: HTMLVideoElement | null) => {
    localVideoRef.current = video;
    if (video) {
      setScrubVideoElement(video);
    }
  }, [setScrubVideoElement]);

  // Also alias for easier access
  const videoRef = localVideoRef;

  // When posterOnlyUntilClick is enabled, defer activation until interaction
  const [isActivated, setIsActivated] = useState<boolean>(() => !posterOnlyUntilClick);
  const speedOptions = [0.25, 0.5, 1, 1.5, 2];
  
  // Safely handle potentially missing or placeholder sources
  const displaySrc = getDisplayUrl(src);
  const hasValidVideoSrc = displaySrc && displaySrc !== '/placeholder.svg';
  
  const stableSrcRef = useRef<string>(stripQueryParameters(src));
  
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    // Skip hover interactions on mobile devices or when scrubbing is disabled
    if (!scrubbingEnabled) {
      return;
    }

    if (loadOnDemand && !hasLoadedOnDemand) {
      setHasLoadedOnDemand(true);
    }

    // Prime video loading if needed
    if (videoRef.current && preloadProp === 'none' && videoRef.current.readyState < 2) {
      try {
        videoRef.current.load();
      } catch { /* intentionally ignored */ }
    }

    // Delegate to the hook's handler for actual scrubbing
    handleScrubMouseMove(e);
  }, [scrubbingEnabled, loadOnDemand, hasLoadedOnDemand, preloadProp, handleScrubMouseMove, videoRef]);

  const handleMouseEnter = useCallback(() => {
    // Handle autoplayOnHover mode separately
    if (autoplayOnHover && !isMobile && !disableScrubbing) {
      if (videoRef.current) {
        void safePlay(videoRef.current, 'HoverScrubVideo.autoplayOnHover', {
          src: getDisplayUrl(src),
        });
      }
      return;
    }

    // Skip if scrubbing not enabled
    if (!scrubbingEnabled) {
      return;
    }

    isHoveringRef.current = true;

    // Prime video loading if needed
    if (videoRef.current && videoRef.current.readyState === 0) {
      try {
        videoRef.current.load();
      } catch { /* intentionally ignored */ }
    }

    // Delegate to the hook's handler
    handleScrubMouseEnter();
  }, [scrubbingEnabled, autoplayOnHover, isMobile, disableScrubbing, handleScrubMouseEnter, src, videoRef]);

  const handleMouseLeave = useCallback(() => {
    // Handle autoplayOnHover mode separately
    if (autoplayOnHover && !isMobile && !disableScrubbing) {
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.currentTime = 0;
      }
      return;
    }

    // Skip if scrubbing not enabled
    if (!scrubbingEnabled) {
      return;
    }

    isHoveringRef.current = false;

    // Delegate to the hook's handler
    handleScrubMouseLeave();
  }, [scrubbingEnabled, autoplayOnHover, isMobile, disableScrubbing, handleScrubMouseLeave, videoRef]);

  const handleSpeedChange = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed;
      setPlaybackRate(speed);
    }
  };

  const handleHoverScrubLoadedMetadata = useCallback(() => {
    // Let the hook handle duration and scrubber recalculation
    handleScrubLoadedMetadata();

    if (!videoRef.current) return;

    // Ensure video is paused first to prevent autoplay
    if (!videoRef.current.paused) {
      videoRef.current.pause();
    }

    // Set to first frame to show as poster - but only for gallery thumbnails, not lightbox
    // IMPORTANT: Skip this if we already have a poster to avoid "weird reset" flashes
    if (!disableScrubbing && videoRef.current.currentTime === 0 && !poster) {
      videoRef.current.currentTime = 0.001;
    }
  }, [disableScrubbing, poster, handleScrubLoadedMetadata, videoRef]);

  useEffect(() => {
    if (thumbnailMode) {
      // Skip attaching event listeners entirely in thumbnail mode
      return;
    }
    const video = videoRef.current;
    if (!video) return;

    const currentStableSrc = stripQueryParameters(src);
    const isActuallyNewSrc = currentStableSrc !== stableSrcRef.current;
    
    // Update stable source ref
    stableSrcRef.current = currentStableSrc;

    // Only perform reset logic if the underlying source has actually changed
    if (isActuallyNewSrc) {
      // Ensure the video starts paused
      video.pause();
      // Important: never force-reset currentTime in lightbox (disableScrubbing=true)
      if (!disableScrubbing) {
        // Only reset currentTime for gallery thumbnails
        video.currentTime = 0;
      }
      // Reset scrubbing state for new source
      resetScrubbing();
    }

    // Add event listeners to track unexpected play events
    const handlePlay = () => {
      // Only enforce anti-autoplay on mobile thumbnails (scrubbing enabled)
      // but allow if explicitly user-initiated (click/touch)
      if (!disableScrubbing && isMobile && !isHoveringRef.current && !userInitiatedPlayRef.current) {
        video.pause();
      }
    };

    const handlePause = () => {
      // Reset user-initiated flag on pause so future autoplays are blocked again
      userInitiatedPlayRef.current = false;
    };

    const handleSeeked = () => {
      
      // Only enforce pause-after-seek on mobile thumbnails, unless user initiated
      if (!disableScrubbing && isMobile && !userInitiatedPlayRef.current && !video.paused) {
        video.pause();
      }
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('seeked', handleSeeked);

    return () => {
      if (video) {
        video.removeEventListener('play', handlePlay);
        video.removeEventListener('pause', handlePause);
        video.removeEventListener('seeked', handleSeeked);
        video.pause();
      }
    };
  // NOTE: scrubbing.reset is a stable callback, no need to include the entire scrubbing object
  // Including scrubbing would cause cleanup to run on every state change (e.g., isPlaying),
  // which would pause the video immediately after play() is called
  }, [src, isMobile, disableScrubbing, thumbnailMode, resetScrubbing, videoRef]);

  // Additional mobile protection - use Intersection Observer to detect when video becomes visible
  // Only for gallery thumbnails, not lightbox
  useEffect(() => {
    if (!isMobile || !videoRef.current || disableScrubbing || thumbnailMode) return;

    const video = videoRef.current;
    
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Ensure video thumbnail is paused when it comes into view on mobile
            if (!video.paused) {
              video.pause();
            }
          }
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(video);

    return () => {
      observer.disconnect();
    };
  }, [isMobile, disableScrubbing, thumbnailMode, videoRef]);

  // Periodic mobile check to catch any unexpected play states - but only for gallery thumbnails
  useEffect(() => {
    if (!isMobile || disableScrubbing || thumbnailMode) return;

    const intervalId = setInterval(() => {
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
    }, 1000);

    return () => {
      clearInterval(intervalId);
    };
  }, [isMobile, disableScrubbing, thumbnailMode, videoRef]);

  return (
    <div
      ref={containerRef}
      className={cn('relative group', className)}
      onMouseEnter={isMobile || disableScrubbing || thumbnailMode ? undefined : handleMouseEnter}
      onMouseLeave={isMobile || disableScrubbing || thumbnailMode ? undefined : handleMouseLeave}
      onMouseMove={isMobile || disableScrubbing || thumbnailMode ? undefined : handleMouseMove}
      {...rest}
    >
      <video
        ref={videoRefCallback}
        src={hasValidVideoSrc ? displaySrc : undefined}
        poster={poster ? getDisplayUrl(poster) : undefined}
        preload={thumbnailMode ? 'none' : (isMobile ? 'metadata' : preloadProp)}
        controls={showNativeControls}
        onLoadedMetadata={handleHoverScrubLoadedMetadata}
        loop={loop}
        muted={muted}
        autoPlay={false}
        playsInline
        className={cn('w-full h-full object-contain', videoClassName, {
          'hide-video-controls': !showNativeControls
        })}
        onDoubleClick={onDoubleClick}
        onTouchEnd={(e) => {
          onTouchEnd?.(e);
        }}
        onLoadStart={(e) => {
          onLoadStart?.(e);
        }}
        onLoadedData={(e) => {
          onLoadedData?.(e);
        }}
        onCanPlay={() => {
          // Prevent autoplay on mobile only for gallery thumbnails (scrubbing enabled)
          if (!disableScrubbing && isMobile && videoRef.current && !videoRef.current.paused) {
            videoRef.current.pause();
          }
        }}
        onError={(e) => {
          normalizeAndPresentError(new Error('[HoverScrubVideo] Video error occurred'), {
            context: 'HoverScrubVideo',
            showToast: false,
            logData: {
              isMobile,
              src: getDisplayUrl(src),
              error: e.currentTarget.error,
              posterSrc: poster ? getDisplayUrl(poster) : 'none',
            },
          });
          onVideoError?.(e);
        }}
      >
        Your browser does not support the video tag.
      </video>

      <HoverScrubVideoOverlays
        posterOnlyUntilClick={posterOnlyUntilClick}
        isActivated={isActivated}
        onActivate={() => setIsActivated(true)}
        isMobile={isMobile}
        disableScrubbing={disableScrubbing}
        thumbnailMode={thumbnailMode}
        scrubberPosition={scrubberPosition}
        scrubberVisible={scrubberVisible}
        duration={duration}
        showSpeedControls={showSpeedControls}
        speedControlsPosition={speedControlsPosition}
        speedOptions={speedOptions}
        playbackRate={playbackRate}
        onSpeedChange={handleSpeedChange}
      />
    </div>
  );
};

export { HoverScrubVideo };
