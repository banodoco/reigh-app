import { useRef, useState, useEffect } from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

// Component to show a mini thumbnail at a specific video time
export function FrameThumbnail({ videoUrl, time }: { videoUrl: string; time: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const loadedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    // Reset loaded state when videoUrl or time changes
    setLoaded(false);
    setError(false);
    loadedRef.current = false;

    // Cleanup previous video
    if (videoRef.current) {
      videoRef.current.src = '';
      videoRef.current.load();
      videoRef.current = null;
    }
  }, [videoUrl, time]);

  useEffect(() => {
    if (!videoUrl || time < 0) return;
    // Skip if already loaded
    if (loadedRef.current) return;

    const video = document.createElement('video');
    videoRef.current = video;
    video.crossOrigin = 'anonymous';
    video.preload = 'auto'; // Use 'auto' for better mobile support
    video.muted = true;
    video.playsInline = true; // Important for iOS
    video.setAttribute('playsinline', ''); // iOS Safari needs this attribute
    video.setAttribute('webkit-playsinline', ''); // Older iOS Safari
    video.src = videoUrl;

    const captureFrame = () => {
      if (loadedRef.current) return; // Prevent double capture
      if (video.readyState >= 2 && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          try {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            loadedRef.current = true;
            setLoaded(true);
          } catch (e) {
            normalizeAndPresentError(e, { context: 'FrameThumbnail.captureFrame' });
            setError(true);
          }
        }
      }
    };

    const handleSeeked = () => {
      captureFrame();
    };

    const handleLoadedData = () => {
      // Seek to time once video data is ready
      if (video.duration && time <= video.duration) {
        video.currentTime = time;
      } else if (video.duration) {
        // If time is beyond duration, use duration
        video.currentTime = Math.max(0, video.duration - 0.1);
      }
    };

    const handleCanPlay = () => {
      // Alternative trigger for mobile browsers
      if (video.currentTime === 0 && time > 0) {
        video.currentTime = Math.min(time, video.duration || time);
      }
    };

    const handleVideoError = () => {
      normalizeAndPresentError(new Error(`Video load error for ${videoUrl}`), { context: 'FrameThumbnail' });
      setError(true);
    };

    video.addEventListener('seeked', handleSeeked);
    video.addEventListener('loadeddata', handleLoadedData);
    video.addEventListener('canplay', handleCanPlay);
    video.addEventListener('error', handleVideoError);

    // Increased timeout for slower mobile connections
    const timeout = setTimeout(() => {
      if (!loadedRef.current && !error) {
        // Try to capture whatever we have
        captureFrame();
      }
    }, 2000);

    // Try to trigger loading
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
  }, [videoUrl, time, error]);

  return (
    <canvas
      ref={canvasRef}
      width={48}
      height={27}
      className={cn(
        "rounded border border-white/30 shadow-lg",
        !loaded && !error && "bg-white/10"
      )}
    />
  );
}
