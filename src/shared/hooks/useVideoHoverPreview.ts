import { useState, useRef, useCallback, useEffect } from 'react';

interface UseVideoHoverPreviewOptions {
  /** Video URL to preview */
  videoUrl: string;
  /** Frame rate of the video */
  frameRate: number;
  /** Whether the hook is enabled */
  enabled?: boolean;
  /** Minimum time between seeks (ms) */
  seekThrottleMs?: number;
  /** JPEG quality for canvas capture (0-1) */
  quality?: number;
}

interface UseVideoHoverPreviewReturn {
  /** Ref to attach to the preview canvas */
  canvasRef: React.RefObject<HTMLCanvasElement>;
  /** Ref to attach to the hidden video element */
  videoRef: React.RefObject<HTMLVideoElement>;
  /** Current video frame number */
  currentFrame: number;
  /** Whether video is ready for seeking */
  isVideoReady: boolean;
  /** Whether currently hovering */
  isHovering: boolean;
  /** Current hover position */
  hoverPosition: { x: number; y: number };
  /** Seek to a specific frame and draw it */
  seekToFrame: (frame: number) => Promise<void>;
  /** Handle mouse enter on the hover area */
  handleMouseEnter: () => void;
  /** Handle mouse leave from the hover area */
  handleMouseLeave: () => void;
  /** Update hover position and optionally seek */
  updateHoverPosition: (x: number, y: number, frame?: number) => void;
  /** Reset all state */
  reset: () => void;
}

/**
 * Hook for showing video frame previews on hover.
 *
 * Creates and manages a hidden video element and canvas for frame extraction.
 * Handles seeking, throttling, and blank frame detection.
 */
export function useVideoHoverPreview(
  options: UseVideoHoverPreviewOptions
): UseVideoHoverPreviewReturn {
  const {
    videoUrl,
    frameRate,
    enabled = true,
    seekThrottleMs = 30,
  } = options;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const seekingRef = useRef(false);
  const pendingSeekRef = useRef<number | null>(null);
  const lastSeekTimeRef = useRef<number>(0);
  const lastDrawnFrameRef = useRef<number>(-1);

  const [currentFrame, setCurrentFrame] = useState(-1);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });

  // Check if canvas is blank (mostly transparent pixels)
  const isCanvasBlank = useCallback((canvas: HTMLCanvasElement): boolean => {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx || canvas.width === 0 || canvas.height === 0) return true;

    try {
      const imageData = ctx.getImageData(0, 0, Math.min(20, canvas.width), Math.min(20, canvas.height));
      const pixels = imageData.data;

      let transparentCount = 0;
      let totalPixels = 0;

      for (let i = 0; i < pixels.length; i += 4) {
        totalPixels++;
        if (pixels[i + 3] === 0) transparentCount++;
      }

      return transparentCount / totalPixels > 0.95;
    } catch {
      return true;
    }
  }, []);

  // Draw video frame to canvas
  const drawVideoFrame = useCallback((video: HTMLVideoElement, frame: number): boolean => {
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
      // Set canvas size to match video
      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(video, 0, 0);

      // Check if draw succeeded
      if (isCanvasBlank(canvas)) {
        seekingRef.current = false;
        return false;
      }

      lastDrawnFrameRef.current = frame;
      return true;
    } catch (e) {
      seekingRef.current = false;
      return false;
    }
  }, [isCanvasBlank]);

  // Ensure video is ready for seeking
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

      if (video.readyState < 2) video.load();
    });
  }, []);

  // Seek to frame and draw
  const seekToFrameCountRef = useRef(0);
  const seekToFrame = useCallback(async (frame: number) => {
    const video = videoRef.current;

    const now = Date.now();
    const timeSinceLastSeek = now - lastSeekTimeRef.current;

    // Throttle seeks
    if (seekingRef.current || timeSinceLastSeek < seekThrottleMs) {
      pendingSeekRef.current = frame;

      if (!seekingRef.current) {
        setTimeout(() => {
          const pending = pendingSeekRef.current;
          if (pending !== null) {
            pendingSeekRef.current = null;
            seekToFrame(pending);
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

      seekToFrameCountRef.current++;

      // Skip seek if already at this frame
      if (Math.abs(video.currentTime - timeInSeconds) < 0.05) {
        drawVideoFrame(video, frame);
        return;
      }

      video.currentTime = timeInSeconds;

      await new Promise<void>((resolve) => {
        const handleSeeked = () => {
          video.removeEventListener('seeked', handleSeeked);
          drawVideoFrame(video, frame);
          resolve();
        };

        video.addEventListener('seeked', handleSeeked, { once: true });

        setTimeout(() => {
          video.removeEventListener('seeked', handleSeeked);
          drawVideoFrame(video, frame);
          resolve();
        }, 500);
      });
    } finally {
      seekingRef.current = false;

      // Process pending seek
      const pendingFrame = pendingSeekRef.current;
      if (pendingFrame !== null && pendingFrame !== frame) {
        pendingSeekRef.current = null;
        seekToFrame(pendingFrame);
      }
    }
  }, [enabled, frameRate, seekThrottleMs, ensureVideoReady, drawVideoFrame]);

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
  }, []);

  const updateHoverPosition = useCallback((x: number, y: number, frame?: number) => {
    setHoverPosition({ x, y });
    if (frame !== undefined && frame !== currentFrame) {
      setCurrentFrame(frame);
      seekToFrame(frame);
    }
  }, [currentFrame, seekToFrame]);

  const reset = useCallback(() => {
    seekingRef.current = false;
    pendingSeekRef.current = null;
    lastSeekTimeRef.current = 0;
    setIsHovering(false);
    setCurrentFrame(-1);
  }, []);

  // Track video ready state
  useEffect(() => {
    const video = videoRef.current;
    if (!video) {
      return;
    }

    const checkReady = () => {
      const ready = video.readyState >= 2;
      setIsVideoReady(ready);
    };

    video.addEventListener('canplay', checkReady);
    video.addEventListener('loadeddata', checkReady);
    checkReady();

    return () => {
      video.removeEventListener('canplay', checkReady);
      video.removeEventListener('loadeddata', checkReady);
    };
  }, [videoUrl]);

  return {
    canvasRef,
    videoRef,
    currentFrame,
    isVideoReady,
    isHovering,
    hoverPosition,
    seekToFrame,
    handleMouseEnter,
    handleMouseLeave,
    updateHoverPosition,
    reset,
  };
}
