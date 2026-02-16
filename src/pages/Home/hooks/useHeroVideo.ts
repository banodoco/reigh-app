import { useState, useRef, useEffect } from 'react';

// Two-video system: Video A plays once (landing), then hands off to looping Video B.
// Also handles poster preload, autoplay fix, and painterly reveal mask.
export function useHeroVideo(isMobile: boolean) {
  const videoARef = useRef<HTMLVideoElement>(null);
  const videoBRef = useRef<HTMLVideoElement>(null);
  const [isLoopVideo, setIsLoopVideo] = useState(false);
  const [videoBReady, setVideoBReady] = useState(false);

  // Poster image loading
  const [posterLoaded, setPosterLoaded] = useState(false);

  // Painterly video reveal
  const videoRevealRef = useRef<HTMLDivElement>(null);
  const revealTriggeredRef = useRef(false);

  // Preload poster image separately - only show when fully loaded
  useEffect(() => {
    const posterImg = new Image();
    posterImg.onload = () => setPosterLoaded(true);
    posterImg.src = '/hero-background-poster.jpg';
  }, []);

  // Video autoplay fix - ensures video plays on all devices
  useEffect(() => {
    const video = videoARef.current;
    if (!video) return;

    video.muted = true;

    const attemptPlay = async () => {
      try {
        await video.play();
      } catch (e) {
        const playOnInteraction = async () => {
          try {
            video.muted = true;
            await video.play();
          } catch (err) { /* intentionally ignored */ }
          document.removeEventListener('touchstart', playOnInteraction);
          document.removeEventListener('click', playOnInteraction);
        };
        document.addEventListener('touchstart', playOnInteraction, { once: true, passive: true });
        document.addEventListener('click', playOnInteraction, { once: true });
      }
    };

    if (video.readyState >= 3) {
      attemptPlay();
    } else {
      video.addEventListener('loadeddata', attemptPlay, { once: true });
    }
  }, []);

  // Preload Video B once Video A starts loading (desktop only)
  useEffect(() => {
    if (isMobile) return;

    const videoA = videoARef.current;
    const videoB = videoBRef.current;
    if (!videoA || !videoB) return;

    const startPreloadingB = () => {
      videoB.load();
    };

    const handleBCanPlay = () => {
      setVideoBReady(true);
    };

    videoB.addEventListener('canplaythrough', handleBCanPlay, { once: true });

    if (videoA.readyState >= 2) {
      startPreloadingB();
    } else {
      videoA.addEventListener('loadeddata', startPreloadingB, { once: true });
    }

    return () => {
      videoB.removeEventListener('canplaythrough', handleBCanPlay);
    };
  }, [isMobile]);

  // Painterly video reveal: trigger when poster is ready
  useEffect(() => {
    if (!posterLoaded) return;
    if (revealTriggeredRef.current) return;
    revealTriggeredRef.current = true;

    const el = videoRevealRef.current;
    if (!el) return;
    el.classList.add('revealing');
  }, [posterLoaded]);

  // Clean up mask after reveal animation completes
  useEffect(() => {
    const el = videoRevealRef.current;
    if (!el) return;

    const handleEnd = (e: AnimationEvent) => {
      if (e.animationName !== 'blob-reveal') return;
      el.style.maskImage = 'none';
      el.style.webkitMaskImage = 'none';
      el.classList.remove('video-reveal', 'revealing');
    };

    el.addEventListener('animationend', handleEnd);
    return () => el.removeEventListener('animationend', handleEnd);
  }, []);

  // Handler for Video A ending - switch to loop video
  const handleVideoAEnded = () => {
    if (!isLoopVideo && videoBReady) {
      const videoB = videoBRef.current;
      if (videoB) {
        videoB.currentTime = 0;
        videoB.play().catch(() => {});
      }
      setIsLoopVideo(true);
    } else if (!isLoopVideo) {
      const checkReady = setInterval(() => {
        const videoB = videoBRef.current;
        if (videoB && videoB.readyState >= 3) {
          clearInterval(checkReady);
          videoB.currentTime = 0;
          videoB.play().catch(() => {});
          setIsLoopVideo(true);
        }
      }, 50);
      setTimeout(() => clearInterval(checkReady), 3000);
    }
  };

  return {
    videoARef,
    videoBRef,
    isLoopVideo,
    posterLoaded,
    videoRevealRef,
    handleVideoAEnded,
  };
}
