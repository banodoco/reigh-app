import { useState, useRef, useEffect } from 'react';
import { handleError } from '@/shared/lib/errorHandler';

/**
 * Manages video playback state: play/pause, seeking, playback rate,
 * frame capture, and readiness tracking.
 */
export function useVideoPlayback() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [videoReady, setVideoReady] = useState(false);

  // Sync video element events with state
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
  }, [videoReady]);

  const togglePlayPause = () => {
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
            console.error('Error playing video:', error);
            setIsPlaying(false);
          });
        }
      }
    } catch (error) {
      console.error('Error toggling play/pause:', error);
      setIsPlaying(false);
    }
  };

  const seekTo = (time: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = time;
    setCurrentTime(time);
  };

  const setVideoPlaybackRate = (rate: number) => {
    if (!videoRef.current) return;
    videoRef.current.playbackRate = rate;
    setPlaybackRate(rate);
  };

  const jumpBackQuarterSecond = () => {
    const current = videoRef.current ? videoRef.current.currentTime : currentTime;
    seekTo(Math.max(0, current - 0.25));
  };

  const jumpForwardQuarterSecond = () => {
    const current = videoRef.current ? videoRef.current.currentTime : currentTime;
    seekTo(Math.min(duration, current + 0.25));
  };

  /** Capture the current visible frame as a JPEG data URL. */
  const captureCurrentFrame = (): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) {
      console.warn('Video not ready for frame capture');
      return null;
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      console.error('Could not get 2D context from canvas');
      return null;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    try {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.8);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'SecurityError') {
        handleError(error, { context: 'VideoSegmentEditor', toastTitle: 'Unable to capture frame due to security restrictions' });
      } else {
        handleError(error, { context: 'VideoSegmentEditor', toastTitle: 'Failed to capture video frame' });
      }
      return null;
    }
  };

  /** Seek to a specific time, capture the frame, then restore the original position. */
  const captureFrameAtTime = (timeInSeconds: number): Promise<string | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current;

      if (!video ||
          !videoReady ||
          !video.videoWidth ||
          !video.videoHeight ||
          video.readyState < 2 ||
          video.networkState === 3) {
        resolve(null);
        return;
      }

      if (timeInSeconds > video.duration) {
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
          console.error('Error during frame capture at time:', timeInSeconds, error);
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
  };

  /** Get the actual current time from the video element (avoids stale React state). */
  const getActualTime = () => videoRef.current ? videoRef.current.currentTime : currentTime;

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
