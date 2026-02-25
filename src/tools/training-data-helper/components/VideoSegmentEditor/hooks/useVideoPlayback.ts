import { useState, useRef, useEffect, useCallback } from 'react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

/**
 * Manages video playback state: play/pause, seeking, playback rate,
 * frame capture, and readiness tracking.
 */
function useVideoPlaybackEventSync(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  videoReady: boolean,
  setCurrentTime: (value: number) => void,
  setIsPlaying: (value: boolean) => void
) {
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || !videoReady) return;

    const handleTimeUpdate = () => setCurrentTime(videoElement.currentTime);
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    videoElement.addEventListener('timeupdate', handleTimeUpdate);
    videoElement.addEventListener('play', handlePlay);
    videoElement.addEventListener('pause', handlePause);

    return () => {
      videoElement.removeEventListener('timeupdate', handleTimeUpdate);
      videoElement.removeEventListener('play', handlePlay);
      videoElement.removeEventListener('pause', handlePause);
    };
  }, [videoRef, videoReady, setCurrentTime, setIsPlaying]);
}

function canCaptureFrameAtTime(
  video: HTMLVideoElement | null,
  videoReady: boolean,
  timeInSeconds: number
): video is HTMLVideoElement {
  if (
    !video
    || !videoReady
    || !video.videoWidth
    || !video.videoHeight
    || video.readyState < 2
    || video.networkState === 3
  ) {
    return false;
  }

  return timeInSeconds <= video.duration;
}

function useVideoFrameCapture(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  videoReady: boolean,
  currentTime: number
) {
  const captureCurrentFrame = useCallback((): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      return null;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.8);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'SecurityError') {
        normalizeAndPresentError(error, { context: 'VideoSegmentEditor', toastTitle: 'Unable to capture frame due to security restrictions' });
      } else {
        normalizeAndPresentError(error, { context: 'VideoSegmentEditor', toastTitle: 'Failed to capture video frame' });
      }
      return null;
    }
  }, [videoRef]);

  const captureFrameAtTime = useCallback((timeInSeconds: number): Promise<string | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current;

      if (!canCaptureFrameAtTime(video, videoReady, timeInSeconds)) {
        resolve(null);
        return;
      }

      const originalTime = video.currentTime;

      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        clearTimeout(timeoutId);

        try {
          const frameImage = captureCurrentFrame();
          video.currentTime = originalTime;
          resolve(frameImage);
        } catch (error) {
          normalizeAndPresentError(error, {
            context: 'useVideoPlayback.captureFrameAtTime',
            toastTitle: 'Failed to capture frame',
            showToast: false,
          });
          video.currentTime = originalTime;
          resolve(null);
        }
      };

      const onError = () => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        clearTimeout(timeoutId);
        video.currentTime = originalTime;
        resolve(null);
      };

      const timeoutId = setTimeout(() => {
        video.removeEventListener('seeked', onSeeked);
        video.removeEventListener('error', onError);
        video.currentTime = originalTime;
        resolve(null);
      }, 3000);

      video.addEventListener('seeked', onSeeked);
      video.addEventListener('error', onError);
      video.currentTime = timeInSeconds;
    });
  }, [videoRef, videoReady, captureCurrentFrame]);

  const getActualTime = useCallback(() => (
    videoRef.current ? videoRef.current.currentTime : currentTime
  ), [videoRef, currentTime]);

  return {
    captureCurrentFrame,
    captureFrameAtTime,
    getActualTime,
  };
}

export function useVideoPlayback() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [videoReady, setVideoReady] = useState(false);

  useVideoPlaybackEventSync(videoRef, videoReady, setCurrentTime, setIsPlaying);

  const togglePlayPause = useCallback(() => {
    if (!videoRef.current) return;

    try {
      const actuallyPlaying = !videoRef.current.paused;

      if (actuallyPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        const playPromise = videoRef.current.play();
        setIsPlaying(true);
        if (playPromise !== undefined) {
          playPromise.catch((error) => {
            normalizeAndPresentError(error, {
              context: 'useVideoPlayback.togglePlayPause.play',
              toastTitle: 'Unable to play video',
              showToast: false,
            });
            setIsPlaying(false);
          });
        }
      }
    } catch (error) {
      normalizeAndPresentError(error, {
        context: 'useVideoPlayback.togglePlayPause',
        toastTitle: 'Unable to toggle playback',
        showToast: false,
      });
      setIsPlaying(false);
    }
  }, []);

  const seekTo = useCallback((time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  }, []);

  const setVideoPlaybackRate = useCallback((rate: number) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  }, []);

  const jumpBackQuarterSecond = useCallback(() => {
    const current = videoRef.current ? videoRef.current.currentTime : currentTime;
    seekTo(Math.max(0, current - 0.25));
  }, [currentTime, seekTo]);

  const jumpForwardQuarterSecond = useCallback(() => {
    const current = videoRef.current ? videoRef.current.currentTime : currentTime;
    seekTo(Math.min(duration, current + 0.25));
  }, [currentTime, duration, seekTo]);

  const { captureCurrentFrame, captureFrameAtTime, getActualTime } = useVideoFrameCapture(
    videoRef,
    videoReady,
    currentTime
  );

  return {
    videoRef,
    isPlaying,
    setIsPlaying,
    currentTime,
    setCurrentTime,
    duration,
    setDuration,
    playbackRate,
    videoReady,
    setVideoReady,
    togglePlayPause,
    seekTo,
    setVideoPlaybackRate,
    jumpBackQuarterSecond,
    jumpForwardQuarterSecond,
    captureCurrentFrame,
    captureFrameAtTime,
    getActualTime,
  };
}
