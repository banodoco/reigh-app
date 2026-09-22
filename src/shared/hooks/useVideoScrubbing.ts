/**
 * useVideoScrubbing - Reusable hook for video scrubbing behavior
 *
 * Extracts the core scrubbing logic so it can be used in different UI patterns:
 * - Traditional: scrub container and video are the same element (HoverScrubVideo)
 * - Separated: scrub on thumbnails, preview plays in a different container (SegmentOutputStrip)
 *
 * Mouse position directly controls video seek position (timeline-style scrubbing).
 */

import { useRef, useState, useCallback, useEffect } from 'react';

interface UseVideoScrubbingOptions {
  /** Whether scrubbing is enabled */
  enabled?: boolean;
  /** Start playing after user stops scrubbing (but stays hovering) */
  playOnStopScrubbing?: boolean;
  /** Delay in ms before auto-play starts (default: 400) */
  playDelay?: number;
  /** Reset video to beginning on mouse leave (default: true) */
  resetOnLeave?: boolean;
  /** Callback when scrub progress changes */
  onProgressChange?: (progress: number, currentTime: number) => void;
  /** Callback when hover starts */
  onHoverStart?: () => void;
  /** Callback when hover ends */
  onHoverEnd?: () => void;
  /** Callback when playback starts */
  onPlayStart?: () => void;
  /** Callback when playback pauses */
  onPlayPause?: () => void;
}

export interface UseVideoScrubbingReturn {
  /** Ref to attach to the scrub trigger container */
  containerRef: React.RefObject<HTMLDivElement>;

  /** Props to spread on the trigger container */
  containerProps: {
    onMouseMove: (e: React.MouseEvent) => void;
    onMouseEnter: () => void;
    onMouseLeave: () => void;
  };

  /** Ref to attach to the video element (can be anywhere in DOM) */
  videoRef: React.RefObject<HTMLVideoElement>;

  /** Props to spread on the video element */
  videoProps: {
    onLoadedMetadata: () => void;
  };

  /** Current scrub progress (0-1) */
  progress: number;

  /** Current time in seconds */
  currentTime: number;

  /** Video duration in seconds */
  duration: number;

  /** Scrubber position as percentage (0-100), null when not scrubbing */
  scrubberPosition: number | null;

  /** Whether scrubber should be visible */
  scrubberVisible: boolean;

  /** Whether mouse is over the trigger container */
  isHovering: boolean;

  /** Whether video is currently playing */
  isPlaying: boolean;

  /** Manually set the video to control (for external video refs) */
  setVideoElement: (video: HTMLVideoElement | null) => void;

  /** Manually set the duration (useful when video metadata isn't loaded yet) */
  setDuration: (duration: number) => void;

  /** Manually seek to a progress value (0-1) */
  seekToProgress: (progress: number) => void;

  /** Start playback */
  play: () => void;

  /** Pause playback */
  pause: () => void;

  /** Reset state (useful when switching videos) */
  reset: () => void;
}

export function useVideoScrubbing(
  options: UseVideoScrubbingOptions = {}
): UseVideoScrubbingReturn {
  const {
    enabled = true,
    playOnStopScrubbing = true,
    playDelay = 400,
    resetOnLeave = true,
    onProgressChange,
    onHoverStart,
    onHoverEnd,
    onPlayStart,
    onPlayPause,
  } = options;

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const externalVideoRef = useRef<HTMLVideoElement | null>(null);
  const mouseMoveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playDeadlineRef = useRef<number | null>(null);
  const interactionVersionRef = useRef(0);
  const playRequestVersionRef = useRef(0);
  const isHoveringRef = useRef(false);
  const lastMouseXRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);

  // State
  const [duration, setDurationState] = useState(0);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [scrubberPosition, setScrubberPosition] = useState<number | null>(null);
  const [scrubberVisible, setScrubberVisible] = useState(true);
  const [isHovering, setIsHovering] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  // Track when video element changes to re-run effects
  const [videoElementVersion, setVideoElementVersion] = useState(0);

  // Get the active video element (external or internal ref)
  const getVideo = useCallback(() => {
    return externalVideoRef.current || videoRef.current;
  }, []);

  const setPlaybackState = useCallback((playing: boolean) => {
    if (isPlayingRef.current === playing) return;
    isPlayingRef.current = playing;
    setIsPlaying(playing);
    if (playing) {
      onPlayStart?.();
    } else {
      onPlayPause?.();
    }
  }, [onPlayPause, onPlayStart]);

  const cancelScheduledPlay = useCallback(() => {
    if (mouseMoveTimeoutRef.current) {
      clearTimeout(mouseMoveTimeoutRef.current);
      mouseMoveTimeoutRef.current = null;
    }
    playDeadlineRef.current = null;
    interactionVersionRef.current += 1;
  }, []);

  // Set external video element
  const setVideoElement = useCallback((video: HTMLVideoElement | null) => {
    cancelScheduledPlay();
    playRequestVersionRef.current += 1;
    setPlaybackState(false);
    if (externalVideoRef.current && externalVideoRef.current !== video) {
      externalVideoRef.current.pause();
    }
    externalVideoRef.current = video;
    // Increment version to trigger re-run of event listener effects
    setVideoElementVersion(v => v + 1);
    setDurationState(video && video.duration > 0 && Number.isFinite(video.duration) ? video.duration : 0);
  }, [cancelScheduledPlay, setPlaybackState]);

  // Set duration manually
  const setDuration = useCallback((dur: number) => {
    if (Number.isFinite(dur) && dur > 0) {
      setDurationState(dur);
    }
  }, []);

  // Reset state
  const reset = useCallback(() => {
    setProgress(0);
    setCurrentTime(0);
    setScrubberPosition(null);
    setScrubberVisible(true);
    setPlaybackState(false);
    lastMouseXRef.current = null;
    cancelScheduledPlay();
    playRequestVersionRef.current += 1;
  }, [cancelScheduledPlay, setPlaybackState]);

  const requestHoverPlay = useCallback((video: HTMLVideoElement, interactionVersion: number) => {
    const requestVersion = ++playRequestVersionRef.current;
    let playResult: Promise<void> | undefined;

    try {
      playResult = video.play();
    } catch {
      return;
    }

    // A late play resolution must not revive a video after hover, source, or
    // element ownership has changed.
    playResult?.then(() => {
      if (
        requestVersion !== playRequestVersionRef.current ||
        interactionVersion !== interactionVersionRef.current ||
        !isHoveringRef.current ||
        getVideo() !== video
      ) {
        video.pause();
        return;
      }
      setPlaybackState(true);
    }).catch(() => {
      // Autoplay policy and media errors are handled by the video element.
    });
  }, [getVideo, setPlaybackState]);

  const scheduleDelayedPlay = useCallback((resetDeadline: boolean) => {
    if (!enabled || !playOnStopScrubbing || !isHoveringRef.current) return;

    if (resetDeadline || playDeadlineRef.current === null) {
      playDeadlineRef.current = Date.now() + playDelay;
    }

    if (mouseMoveTimeoutRef.current) {
      clearTimeout(mouseMoveTimeoutRef.current);
    }

    const deadline = playDeadlineRef.current;
    const interactionVersion = interactionVersionRef.current;
    mouseMoveTimeoutRef.current = setTimeout(() => {
      mouseMoveTimeoutRef.current = null;
      const video = getVideo();
      const dur = duration || (video?.duration ?? 0);

      if (
        !video ||
        !isHoveringRef.current ||
        interactionVersion !== interactionVersionRef.current ||
        !Number.isFinite(dur) ||
        dur <= 0
      ) {
        // If metadata is still pending, handleLoadedMetadata will schedule
        // immediately using the already elapsed deadline.
        return;
      }

      playDeadlineRef.current = null;
      requestHoverPlay(video, interactionVersion);
    }, Math.max(0, deadline - Date.now()));
  }, [duration, enabled, getVideo, playDelay, playOnStopScrubbing, requestHoverPlay]);

  // Seek to progress
  const seekToProgress = useCallback((prog: number) => {
    const video = getVideo();
    const dur = duration || (video?.duration ?? 0);

    if (!Number.isFinite(dur) || dur <= 0) return;

    const clampedProgress = Math.max(0, Math.min(1, prog));
    const targetTime = clampedProgress * dur;

    if (Number.isFinite(targetTime)) {
      if (video) {
        video.currentTime = targetTime;
      }
      setProgress(clampedProgress);
      setCurrentTime(targetTime);
      onProgressChange?.(clampedProgress, targetTime);
    }
  }, [duration, getVideo, onProgressChange]);

  // Play
  const play = useCallback(() => {
    const video = getVideo();
    if (video) {
      let playResult: Promise<void> | undefined;
      try {
        playResult = video.play();
      } catch {
        return;
      }
      playResult?.then(() => setPlaybackState(true)).catch(() => undefined);
    }
  }, [getVideo, setPlaybackState]);

  // Pause
  const pause = useCallback(() => {
    const video = getVideo();
    if (video) {
      video.pause();
    }
    setPlaybackState(false);
  }, [getVideo, setPlaybackState]);

  // Handle mouse move (scrubbing)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!enabled) return;

    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    lastMouseXRef.current = mouseX;

    const prog = Math.max(0, Math.min(1, mouseX / rect.width));

    // Always show scrubber position (percentage-based) even if duration isn't ready
    setScrubberPosition(prog * 100);
    setScrubberVisible(true);
    setProgress(prog);

    const video = getVideo();
    const dur = duration || (video?.duration ?? 0);

    if (!Number.isFinite(dur) || dur <= 0) {
      // Duration not ready - try to load video
      if (video && video.readyState === 0) {
        video.load();
      }
      // Still fire callback with progress (useful for UI that doesn't need actual seek)
      onProgressChange?.(prog, 0);
      scheduleDelayedPlay(true);
      return;
    }

    const targetTime = prog * dur;
    if (!Number.isFinite(targetTime)) return;

    // Pause and seek
    if (video) {
      video.pause();
      video.currentTime = targetTime;
      setPlaybackState(false);
    }
    setCurrentTime(targetTime);

    onProgressChange?.(prog, targetTime);

    scheduleDelayedPlay(true);
  }, [duration, enabled, getVideo, onProgressChange, scheduleDelayedPlay, setPlaybackState]);

  // Handle mouse enter
  const handleMouseEnter = useCallback(() => {
    if (!enabled) return;

    isHoveringRef.current = true;
    setIsHovering(true);
    onHoverStart?.();

    const video = getVideo();
    if (video) {
      // Prime video loading if needed
      if (video.readyState === 0) {
        video.load();
      }
      video.pause();
      setPlaybackState(false);
    }

    scheduleDelayedPlay(true);
  }, [enabled, getVideo, onHoverStart, scheduleDelayedPlay, setPlaybackState]);

  // Handle mouse leave
  const handleMouseLeave = useCallback(() => {
    if (!enabled) return;

    isHoveringRef.current = false;
    playRequestVersionRef.current += 1;
    setIsHovering(false);
    lastMouseXRef.current = null;
    setScrubberPosition(null);
    setScrubberVisible(true);

    cancelScheduledPlay();

    const video = getVideo();
    if (video) {
      video.pause();
      if (resetOnLeave) {
        video.currentTime = 0;
        setProgress(0);
        setCurrentTime(0);
      }
      setPlaybackState(false);
    }

    onHoverEnd?.();
  }, [cancelScheduledPlay, enabled, getVideo, onHoverEnd, resetOnLeave, setPlaybackState]);

  // Handle video metadata loaded
  const handleLoadedMetadata = useCallback(() => {
    const video = getVideo();
    if (!video) return;

    const newDuration = video.duration;
    if (!Number.isFinite(newDuration) || newDuration <= 0) return;

    setDurationState(newDuration);

    // Recalculate scrubber if user was hovering while metadata loaded
    if (isHoveringRef.current && lastMouseXRef.current !== null && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const prog = Math.max(0, Math.min(1, lastMouseXRef.current / rect.width));
      const targetTime = prog * newDuration;

      if (Number.isFinite(targetTime)) {
        setScrubberPosition(prog * 100);
        setScrubberVisible(true);
        setProgress(prog);
        setCurrentTime(targetTime);

        video.pause();
        video.currentTime = targetTime;
        onProgressChange?.(prog, targetTime);
      }
    }

    if (isHoveringRef.current && playOnStopScrubbing) {
      scheduleDelayedPlay(false);
    }
  }, [getVideo, onProgressChange, playOnStopScrubbing, scheduleDelayedPlay]);

  // Track video play/pause state and time updates during playback
  useEffect(() => {
    const video = getVideo();
    if (!video) return;

    const handlePlay = () => {
      setPlaybackState(true);
      if (isHoveringRef.current) {
        setScrubberVisible(false);
      }
    };

    const handlePause = () => {
      setPlaybackState(false);
    };

    const handleDurationChange = () => {
      if (video.duration && Number.isFinite(video.duration)) {
        setDurationState(video.duration);
      }
    };

    // Update progress/currentTime during playback
    const handleTimeUpdate = () => {
      const dur = video.duration;
      if (!Number.isFinite(dur) || dur <= 0) return;

      const time = video.currentTime;
      const prog = time / dur;

      setCurrentTime(time);
      setProgress(prog);

      // Only update scrubber position if still hovering
      // (avoids resetting it after mouse leave triggers currentTime = 0)
      if (isHoveringRef.current) {
        setScrubberPosition(prog * 100);
      }

      onProgressChange?.(prog, time);
    };

    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    video.addEventListener('durationchange', handleDurationChange);
    video.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
      video.removeEventListener('durationchange', handleDurationChange);
      video.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [getVideo, onProgressChange, setPlaybackState, videoElementVersion]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelScheduledPlay();
      playRequestVersionRef.current += 1;
    };
  }, [cancelScheduledPlay]);

  useEffect(() => {
    if (!enabled) {
      isHoveringRef.current = false;
      cancelScheduledPlay();
      playRequestVersionRef.current += 1;
      setIsHovering(false);
      setScrubberPosition(null);
      setScrubberVisible(true);
    }
  }, [cancelScheduledPlay, enabled]);

  useEffect(() => {
    if (!playOnStopScrubbing) {
      cancelScheduledPlay();
    }
  }, [cancelScheduledPlay, playOnStopScrubbing]);

  return {
    containerRef,
    containerProps: {
      onMouseMove: handleMouseMove,
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
    },
    videoRef,
    videoProps: {
      onLoadedMetadata: handleLoadedMetadata,
    },
    progress,
    currentTime,
    duration,
    scrubberPosition,
    scrubberVisible,
    isHovering,
    isPlaying,
    setVideoElement,
    setDuration,
    seekToProgress,
    play,
    pause,
    reset,
  };
}
