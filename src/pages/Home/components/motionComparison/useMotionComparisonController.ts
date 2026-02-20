import { useCallback, useRef, useState } from 'react';
import type { MouseEvent, TouchEvent, SyntheticEvent } from 'react';

type MotionPointerEvent = MouseEvent | TouchEvent;

interface PointerPosition {
  clientX: number;
}

function getPointerPosition(event: MotionPointerEvent): PointerPosition {
  if ('touches' in event) {
    return { clientX: event.touches[0].clientX };
  }

  return { clientX: event.clientX };
}

export function useMotionComparisonController() {
  const [sliderPos, setSliderPos] = useState(50);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [fadeOpacity, setFadeOpacity] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const videoInputRef = useRef<HTMLVideoElement>(null);
  const videoOutputRef = useRef<HTMLVideoElement>(null);

  const handleTimeUpdate = useCallback(() => {
    const video = videoOutputRef.current;
    if (!video) {
      return;
    }

    const timeRemaining = video.duration - video.currentTime;
    if (timeRemaining <= 5) {
      setFadeOpacity(1 - (timeRemaining / 5));
      return;
    }

    setFadeOpacity(0);
  }, []);

  const handlePointerMove = useCallback((event: MotionPointerEvent) => {
    if (!containerRef.current || !isPlaying) {
      return;
    }

    setIsAnimating(false);

    const rect = containerRef.current.getBoundingClientRect();
    const pointer = getPointerPosition(event);
    const x = Math.max(0, Math.min(pointer.clientX - rect.left, rect.width));
    setSliderPos((x / rect.width) * 100);
  }, [isPlaying]);

  const handleMouseMove = useCallback((event: MouseEvent) => {
    handlePointerMove(event);
  }, [handlePointerMove]);

  const handleTouchMove = useCallback((event: TouchEvent) => {
    handlePointerMove(event);
  }, [handlePointerMove]);

  const togglePlay = useCallback((event: MotionPointerEvent) => {
    event.stopPropagation();

    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);
    setIsAnimating(true);

    if (!nextPlaying) {
      videoInputRef.current?.pause();
      videoOutputRef.current?.pause();
      setSliderPos(50);
      return;
    }

    setSliderPos(20);
    videoInputRef.current?.play().catch(() => {});
    videoOutputRef.current?.play().catch(() => {});

    if (videoInputRef.current && videoOutputRef.current) {
      if (videoOutputRef.current.duration && videoInputRef.current.duration) {
        const ratio = videoInputRef.current.duration / videoOutputRef.current.duration;
        videoInputRef.current.playbackRate = ratio;
      }
    }
  }, [isPlaying]);

  const toggleMute = useCallback((event: MouseEvent) => {
    event.stopPropagation();
    setIsMuted(prev => !prev);
  }, []);

  const resetSliderOnIdle = useCallback(() => {
    if (!isPlaying) {
      setSliderPos(50);
    }
  }, [isPlaying]);

  const handleOutputSeeked = useCallback(() => {
    setFadeOpacity(0);
  }, []);

  const handleInputLoadedMetadata = useCallback((event: SyntheticEvent<HTMLVideoElement>) => {
    const video = event.currentTarget;
    if (videoOutputRef.current?.duration) {
      video.playbackRate = video.duration / videoOutputRef.current.duration;
    }
  }, []);

  return {
    sliderPos,
    isPlaying,
    isMuted,
    fadeOpacity,
    isAnimating,
    containerRef,
    videoInputRef,
    videoOutputRef,
    handleTimeUpdate,
    handleMouseMove,
    handleTouchMove,
    togglePlay,
    toggleMute,
    resetSliderOnIdle,
    handleOutputSeeked,
    handleInputLoadedMetadata,
  };
}
