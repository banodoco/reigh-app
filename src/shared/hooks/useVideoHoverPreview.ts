import { useState, useRef, useCallback } from 'react';
import { useSeekController } from './videoHoverPreview/useSeekController';

interface UseVideoHoverPreviewOptions {
  videoUrl: string;
  frameRate: number;
  enabled?: boolean;
  seekThrottleMs?: number;
  quality?: number;
}

interface UseVideoHoverPreviewReturn {
  canvasRef: React.RefObject<HTMLCanvasElement>;
  videoRef: React.RefObject<HTMLVideoElement>;
  currentFrame: number;
  isVideoReady: boolean;
  isHovering: boolean;
  hoverPosition: { x: number; y: number };
  seekToFrame: (frame: number) => Promise<void>;
  handleMouseEnter: () => void;
  handleMouseLeave: () => void;
  updateHoverPosition: (x: number, y: number, frame?: number) => void;
  reset: () => void;
}

export function useVideoHoverPreview(
  options: UseVideoHoverPreviewOptions,
): UseVideoHoverPreviewReturn {
  const {
    videoUrl,
    frameRate,
    enabled = true,
    seekThrottleMs = 30,
  } = options;

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentFrame, setCurrentFrame] = useState(-1);
  const [isHovering, setIsHovering] = useState(false);
  const [hoverPosition, setHoverPosition] = useState({ x: 0, y: 0 });

  const { seekToFrame, isVideoReady, resetSeekState } = useSeekController({
    videoRef,
    canvasRef,
    videoUrl,
    frameRate,
    seekThrottleMs,
  });

  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
  }, []);

  const updateHoverPosition = useCallback((x: number, y: number, frame?: number) => {
    if (!enabled) {
      return;
    }

    setHoverPosition({ x, y });
    if (frame !== undefined && frame !== currentFrame) {
      setCurrentFrame(frame);
      void seekToFrame(frame);
    }
  }, [enabled, currentFrame, seekToFrame]);

  const reset = useCallback(() => {
    resetSeekState();
    setIsHovering(false);
    setCurrentFrame(-1);
  }, [resetSeekState]);

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
