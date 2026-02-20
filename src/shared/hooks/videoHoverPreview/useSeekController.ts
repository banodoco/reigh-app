import { useState, useRef, useCallback, useEffect } from 'react';

interface UseSeekControllerInput {
  videoRef: React.RefObject<HTMLVideoElement>;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  videoUrl: string;
  frameRate: number;
  seekThrottleMs: number;
}

interface UseSeekControllerReturn {
  isVideoReady: boolean;
  seekToFrame: (frame: number) => Promise<void>;
  resetSeekState: () => void;
}

export function useSeekController({
  videoRef,
  canvasRef,
  videoUrl,
  frameRate,
  seekThrottleMs,
}: UseSeekControllerInput): UseSeekControllerReturn {
  const seekingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const lastSeekTimeRef = useRef<number>(0);
  const [isVideoReady, setIsVideoReady] = useState(false);

  const isCanvasBlank = useCallback((canvas: HTMLCanvasElement): boolean => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || canvas.width === 0 || canvas.height === 0) {
      return true;
    }

    try {
      const imageData = ctx.getImageData(0, 0, Math.min(20, canvas.width), Math.min(20, canvas.height));
      const pixels = imageData.data;
      let transparentCount = 0;
      let totalPixels = 0;

      for (let i = 0; i < pixels.length; i += 4) {
        totalPixels += 1;
        if (pixels[i + 3] === 0) {
          transparentCount += 1;
        }
      }

      return transparentCount / totalPixels > 0.95;
    } catch {
      return true;
    }
  }, []);

  const drawVideoFrame = useCallback((video: HTMLVideoElement): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return false;
    }

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      return false;
    }

    if (video.readyState < 2 || video.videoWidth === 0 || video.videoHeight === 0) {
      return false;
    }

    try {
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0);

      if (isCanvasBlank(canvas)) {
        seekingRef.current = false;
        return false;
      }

      return true;
    } catch {
      seekingRef.current = false;
      return false;
    }
  }, [canvasRef, isCanvasBlank]);

  const ensureVideoReady = useCallback(async (video: HTMLVideoElement): Promise<boolean> => {
    if (video.readyState >= 2) {
      return true;
    }

    return new Promise<boolean>((resolve) => {
      const handleReady = () => {
        video.removeEventListener('canplay', handleReady);
        video.removeEventListener('loadeddata', handleReady);
        resolve(true);
      };

      video.addEventListener('canplay', handleReady);
      video.addEventListener('loadeddata', handleReady);

      setTimeout(() => {
        video.removeEventListener('canplay', handleReady);
        video.removeEventListener('loadeddata', handleReady);
        resolve(video.readyState >= 1);
      }, 1000);

      if (video.readyState < 2) {
        video.load();
      }
    });
  }, []);

  const seekToFrame = useCallback(async (frame: number) => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const now = Date.now();
    const timeSinceLastSeek = now - lastSeekTimeRef.current;

    if (seekingRef.current || timeSinceLastSeek < seekThrottleMs) {
      pendingSeekRef.current = frame;

      if (!seekingRef.current) {
        setTimeout(() => {
          const pendingFrame = pendingSeekRef.current;
          if (pendingFrame !== null) {
            pendingSeekRef.current = null;
            void seekToFrame(pendingFrame);
          }
        }, seekThrottleMs - timeSinceLastSeek);
      }
      return;
    }

    seekingRef.current = true;
    lastSeekTimeRef.current = now;

    try {
      const ready = await ensureVideoReady(video);
      if (!ready) {
        return;
      }

      const timeInSeconds = frame / frameRate;
      if (Math.abs(video.currentTime - timeInSeconds) < 0.05) {
        drawVideoFrame(video);
        return;
      }

      video.currentTime = timeInSeconds;

      await new Promise<void>((resolve) => {
        const handleSeeked = () => {
          video.removeEventListener('seeked', handleSeeked);
          drawVideoFrame(video);
          resolve();
        };

        video.addEventListener('seeked', handleSeeked, { once: true });

        setTimeout(() => {
          video.removeEventListener('seeked', handleSeeked);
          drawVideoFrame(video);
          resolve();
        }, 500);
      });
    } finally {
      seekingRef.current = false;

      const pendingFrame = pendingSeekRef.current;
      if (pendingFrame !== null && pendingFrame !== frame) {
        pendingSeekRef.current = null;
        void seekToFrame(pendingFrame);
      }
    }
  }, [drawVideoFrame, ensureVideoReady, frameRate, seekThrottleMs, videoRef]);

  const resetSeekState = useCallback(() => {
    seekingRef.current = false;
    pendingSeekRef.current = null;
    lastSeekTimeRef.current = 0;
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const checkReady = () => {
      setIsVideoReady(video.readyState >= 2);
    };

    video.addEventListener('canplay', checkReady);
    video.addEventListener('loadeddata', checkReady);
    checkReady();

    return () => {
      video.removeEventListener('canplay', checkReady);
      video.removeEventListener('loadeddata', checkReady);
    };
  }, [videoRef, videoUrl]);

  return {
    isVideoReady,
    seekToFrame,
    resetSeekState,
  };
}
