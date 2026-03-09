import { useEffect, useRef, useState } from 'react';
import { normalizeAndPresentError } from '../../../lib/errorHandling/runtimeError';

interface UseVideoPlayerStateParams {
  videoRef: React.RefObject<HTMLVideoElement>;
  src: string;
  poster?: string;
  muted: boolean;
  playbackStart?: number;
  playbackEnd?: number;
}

interface UseVideoPlayerStateResult {
  isPlaying: boolean;
  setIsPlaying: React.Dispatch<React.SetStateAction<boolean>>;
  isMuted: boolean;
  setIsMuted: React.Dispatch<React.SetStateAction<boolean>>;
  currentTime: number;
  setCurrentTime: React.Dispatch<React.SetStateAction<number>>;
  duration: number;
  showControls: boolean;
  isVideoReady: boolean;
  setIsHovering: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useVideoPlayerState({
  videoRef,
  src,
  poster,
  muted,
  playbackStart,
  playbackEnd,
}: UseVideoPlayerStateParams): UseVideoPlayerStateResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(muted);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);

  const prevSrcRef = useRef(src);
  const prevPosterRef = useRef(poster);
  if (prevSrcRef.current !== src || prevPosterRef.current !== poster) {
    prevSrcRef.current = src;
    prevPosterRef.current = poster;
    if (isVideoReady) {
      setIsVideoReady(false);
    }
  }

  const hasPlaybackConstraints =
    playbackStart !== undefined && playbackEnd !== undefined;
  const effectiveStart = playbackStart ?? 0;
  const effectiveEnd = playbackEnd ?? duration;

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }
    video.muted = muted;
    setIsMuted(muted);
  }, [videoRef, muted]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const updateTime = () => {
      setCurrentTime(video.currentTime);

      if (hasPlaybackConstraints && !video.paused) {
        if (video.currentTime >= effectiveEnd) {
          video.currentTime = effectiveStart;
        } else if (video.currentTime < effectiveStart) {
          video.currentTime = effectiveStart;
        }
      }
    };

    const updateDuration = () => {
      if (Number.isFinite(video.duration) && video.duration > 0) {
        setDuration(video.duration);
        if (hasPlaybackConstraints && effectiveStart > 0) {
          video.currentTime = effectiveStart;
        }
      }
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleCanPlay = () => setIsVideoReady(true);
    const handleVideoError = () => {
      const mediaError = video.error;
      normalizeAndPresentError(
        new Error(mediaError?.message || 'Video playback error'),
        {
          context: 'StyledVideoPlayer',
          showToast: false,
          logData: {
            src: src?.substring(0, 80),
            errorCode: mediaError?.code,
            readyState: video.readyState,
            networkState: video.networkState,
            networkStateLabel: ['EMPTY', 'IDLE', 'LOADING', 'NO_SOURCE'][
              video.networkState
            ],
          },
        }
      );
    };

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', updateDuration);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleVideoError);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', updateDuration);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleVideoError);
    };
  }, [videoRef, src, hasPlaybackConstraints, effectiveStart, effectiveEnd]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hasPlaybackConstraints || duration === 0) {
      return;
    }
    if (video.currentTime < effectiveStart || video.currentTime > effectiveEnd) {
      video.currentTime = effectiveStart;
    }
  }, [videoRef, hasPlaybackConstraints, effectiveStart, effectiveEnd, duration]);

  useEffect(() => {
    let timeout: NodeJS.Timeout | undefined;

    if (isHovering) {
      setShowControls(true);
    } else {
      timeout = setTimeout(() => setShowControls(false), 2000);
    }

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [isHovering]);

  return {
    isPlaying,
    setIsPlaying,
    isMuted,
    setIsMuted,
    currentTime,
    setCurrentTime,
    duration,
    showControls,
    isVideoReady,
    setIsHovering,
  };
}
