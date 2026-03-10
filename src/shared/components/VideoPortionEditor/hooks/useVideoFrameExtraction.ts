import { useEffect, useRef, useState } from 'react';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface UseVideoFrameExtractionParams {
  videoUrl: string;
  time: number;
  size?: 'small' | 'large';
}

interface UseVideoFrameExtractionResult {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  loaded: boolean;
  error: boolean;
  canvasWidth: number;
  canvasHeight: number;
}

export function useVideoPortionFrameExtraction({
  videoUrl,
  time,
  size = 'small',
}: UseVideoFrameExtractionParams): UseVideoFrameExtractionResult {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const loadedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [videoDimensions, setVideoDimensions] = useState<{
    width: number;
    height: number;
  } | null>(null);

  const baseWidth = size === 'large' ? 160 : 48;
  const aspectRatio = videoDimensions
    ? videoDimensions.width / videoDimensions.height
    : 16 / 9;
  const canvasWidth = baseWidth;
  const canvasHeight = Math.round(baseWidth / aspectRatio);

  useEffect(() => {
    setLoaded(false);
    setError(false);
    loadedRef.current = false;

    if (videoRef.current) {
      videoRef.current.src = '';
      videoRef.current.load();
      videoRef.current = null;
    }
  }, [videoUrl, time]);

  useEffect(() => {
    if (!videoUrl || time < 0) {
      return;
    }
    if (loadedRef.current) {
      return;
    }

    const video = document.createElement('video');
    videoRef.current = video;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.src = videoUrl;

    const captureFrame = () => {
      if (loadedRef.current || !canvasRef.current || video.readyState < 2) {
        return;
      }
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }
      try {
        if (video.videoWidth && video.videoHeight) {
          const videoAspect = video.videoWidth / video.videoHeight;
          const targetWidth = size === 'large' ? 160 : 48;
          const targetHeight = Math.round(targetWidth / videoAspect);
          canvas.width = targetWidth;
          canvas.height = targetHeight;
          setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        loadedRef.current = true;
        setLoaded(true);
      } catch (cause) {
        normalizeAndPresentError(cause, {
          context: 'SegmentThumbnail',
          showToast: false,
        });
        setError(true);
      }
    };

    const handleSeeked = () => {
      captureFrame();
    };

    const handleLoadedData = () => {
      if (video.videoWidth && video.videoHeight) {
        setVideoDimensions({ width: video.videoWidth, height: video.videoHeight });
      }
      if (video.duration && time <= video.duration) {
        video.currentTime = time;
      } else if (video.duration) {
        video.currentTime = Math.max(0, video.duration - 0.1);
      }
    };

    const handleCanPlay = () => {
      if (video.currentTime === 0 && time > 0) {
        video.currentTime = Math.min(time, video.duration || time);
      }
    };

    const handleVideoError = () => {
      normalizeAndPresentError(new Error(`Video load error for ${videoUrl}`), {
        context: 'SegmentThumbnail',
        showToast: false,
      });
      setError(true);
    };

    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleVideoError);

    const timeout = setTimeout(() => {
      if (!loadedRef.current && !error) {
        captureFrame();
      }
    }, 2000);

    video.load();

    return () => {
      clearTimeout(timeout);
      video.removeEventListener('seeked', handleSeeked);
      video.removeEventListener('loadeddata', handleLoadedData);
      video.removeEventListener('canplay', handleCanPlay);
      video.removeEventListener('error', handleVideoError);
      video.src = '';
      video.load();
    };
  }, [videoUrl, time, error, size]);

  return {
    canvasRef,
    loaded,
    error,
    canvasWidth,
    canvasHeight,
  };
}
