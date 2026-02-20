import { useState, useCallback, useRef, useEffect } from 'react';
import type { PreviewSegment } from '../PreviewTogetherTypes';

interface UsePreviewTogetherPlaybackParams {
  isOpen: boolean;
  previewableSegments: PreviewSegment[];
  audioUrl?: string | null;
  initialPairIndex?: number | null;
}

type VideoSlot = 'A' | 'B';

interface VideoHandlers {
  onClick: () => void;
  onPlay: () => void;
  onPause: () => void;
  onTimeUpdate: () => void;
  onSeeked: () => void;
  onLoadedMetadata: () => void;
  onEnded: () => void;
}

const NOOP_VIDEO_HANDLERS: VideoHandlers = {
  onClick: () => undefined,
  onPlay: () => undefined,
  onPause: () => undefined,
  onTimeUpdate: () => undefined,
  onSeeked: () => undefined,
  onLoadedMetadata: () => undefined,
  onEnded: () => undefined,
};

export function usePreviewTogetherPlayback({
  isOpen,
  previewableSegments,
  audioUrl,
  initialPairIndex,
}: UsePreviewTogetherPlaybackParams) {
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [previewIsPlaying, setPreviewIsPlaying] = useState(true);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [isPreviewVideoLoading, setIsPreviewVideoLoading] = useState(true);

  const [segmentDurations, setSegmentDurations] = useState<number[]>([]);
  const [segmentOffsets, setSegmentOffsets] = useState<number[]>([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

  const [crossfadeProgress, setCrossfadeProgress] = useState(0);
  const crossfadeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRefB = useRef<HTMLVideoElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement>(null);
  const previewThumbnailsRef = useRef<HTMLDivElement>(null);
  const [activeVideoSlot, setActiveVideoSlot] = useState<VideoSlot>('A');
  const [preloadedIndex, setPreloadedIndex] = useState<number | null>(null);
  const preloadingIndexRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setCurrentPreviewIndex(0);
      setPreviewCurrentTime(0);
      setPreviewDuration(0);
      setPreviewIsPlaying(false);
      setIsPreviewVideoLoading(true);
      setSegmentDurations([]);
      setSegmentOffsets([]);
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current.currentTime = 0;
      }
      setCrossfadeProgress(0);
      if (crossfadeTimerRef.current) {
        clearInterval(crossfadeTimerRef.current);
        crossfadeTimerRef.current = null;
      }
      setActiveVideoSlot('A');
      setPreloadedIndex(null);
      preloadingIndexRef.current = null;
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && initialPairIndex != null && previewableSegments.length > 0) {
      const targetIdx = previewableSegments.findIndex((segment) => segment.index === initialPairIndex);
      if (targetIdx >= 0) {
        setCurrentPreviewIndex(targetIdx);
      }
    }
  }, [initialPairIndex, isOpen, previewableSegments]);

  useEffect(() => {
    if (isOpen) {
      setPreviewIsPlaying(true);
    }
  }, [isOpen, currentPreviewIndex]);

  const getGlobalTime = useCallback((segmentIndex: number, timeInSegment: number) => {
    if (segmentOffsets.length === 0 || segmentIndex >= segmentOffsets.length) return 0;
    return segmentOffsets[segmentIndex] + timeInSegment;
  }, [segmentOffsets]);

  const syncAudioToVideo = useCallback(() => {
    const video = previewVideoRef.current;
    const audio = previewAudioRef.current;
    if (!video || !audio || !isAudioEnabled || !audioUrl) return;

    const scaledVideoTime = video.currentTime / (video.playbackRate || 1);
    const globalTime = getGlobalTime(currentPreviewIndex, scaledVideoTime);
    audio.currentTime = globalTime;

    if (!video.paused) {
      audio.play().catch(() => undefined);
    }
  }, [audioUrl, currentPreviewIndex, getGlobalTime, isAudioEnabled]);

  useEffect(() => {
    if (!isOpen || previewableSegments.length === 0) return;

    const durations = previewableSegments.map((segment) => segment.durationFromFrames || 2);
    const offsets: number[] = [0];
    for (let idx = 0; idx < durations.length - 1; idx++) {
      offsets.push(offsets[idx] + durations[idx]);
    }

    setSegmentDurations(durations);
    setSegmentOffsets(offsets);
  }, [isOpen, previewableSegments]);

  useEffect(() => {
    if (!isOpen || !previewThumbnailsRef.current) return;

    const container = previewThumbnailsRef.current;
    const thumbnailWidth = 64;
    const gap = 8;
    const itemTotalWidth = thumbnailWidth + gap;
    const containerWidth = container.offsetWidth;
    const totalSegments = previewableSegments.length;
    const totalContentWidth = (totalSegments * thumbnailWidth) + ((totalSegments - 1) * gap);

    if (totalContentWidth <= containerWidth) return;

    const thumbnailCenter = (currentPreviewIndex * itemTotalWidth) + (thumbnailWidth / 2);
    const idealScrollLeft = thumbnailCenter - (containerWidth / 2);
    const maxScroll = totalContentWidth - containerWidth;
    const clampedScrollLeft = Math.max(0, Math.min(maxScroll, idealScrollLeft));

    container.scrollTo({
      left: clampedScrollLeft,
      behavior: 'smooth',
    });
  }, [currentPreviewIndex, isOpen, previewableSegments.length]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const isTyping = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );
      if (isTyping) return;
      if (previewableSegments.length === 0) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveVideoSlot('A');
        setPreloadedIndex(null);
        setCurrentPreviewIndex((prev) => (prev > 0 ? prev - 1 : previewableSegments.length - 1));
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        setActiveVideoSlot('A');
        setPreloadedIndex(null);
        setCurrentPreviewIndex((prev) => (prev + 1) % previewableSegments.length);
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, previewableSegments.length]);

  useEffect(() => {
    if (!isOpen || previewableSegments.length <= 1) return;

    const safeIndex = Math.min(currentPreviewIndex, previewableSegments.length - 1);
    const nextIndex = (safeIndex + 1) % previewableSegments.length;
    const nextSegment = previewableSegments[nextIndex];
    if (!nextSegment?.hasVideo || preloadedIndex === nextIndex || preloadingIndexRef.current === nextIndex) return;

    let preloadedVideo: HTMLVideoElement | null = null;
    let canPlayHandler: (() => void) | null = null;
    let retryInterval: NodeJS.Timeout | null = null;

    const attemptPreload = () => {
      const inactiveVideo = activeVideoSlot === 'A' ? previewVideoRefB.current : previewVideoRef.current;
      if (!inactiveVideo) return false;

      preloadedVideo = inactiveVideo;
      preloadingIndexRef.current = nextIndex;
      canPlayHandler = () => {
        if (preloadingIndexRef.current === nextIndex) {
          setPreloadedIndex(nextIndex);
          preloadingIndexRef.current = null;
        }
        if (preloadedVideo && canPlayHandler) {
          preloadedVideo.removeEventListener('canplaythrough', canPlayHandler);
        }
      };

      inactiveVideo.addEventListener('canplaythrough', canPlayHandler);
      inactiveVideo.src = nextSegment.videoUrl!;
      inactiveVideo.load();
      return true;
    };

    if (!attemptPreload()) {
      let retryCount = 0;
      const maxRetries = 20;
      retryInterval = setInterval(() => {
        retryCount += 1;
        if (attemptPreload() || retryCount >= maxRetries) {
          if (retryInterval) clearInterval(retryInterval);
          retryInterval = null;
        }
      }, 50);
    }

    return () => {
      if (retryInterval) clearInterval(retryInterval);
      if (preloadedVideo && canPlayHandler) {
        preloadedVideo.removeEventListener('canplaythrough', canPlayHandler);
      }
    };
  }, [activeVideoSlot, currentPreviewIndex, isOpen, preloadedIndex, previewableSegments]);

  useEffect(() => {
    if (!isOpen || previewableSegments.length === 0) return;

    const safeIndex = Math.min(currentPreviewIndex, previewableSegments.length - 1);
    const currentSegment = previewableSegments[safeIndex];
    if (!currentSegment?.hasVideo || !currentSegment.videoUrl) return;

    const setupAndPlayVideo = () => {
      const activeVideo = activeVideoSlot === 'A' ? previewVideoRef.current : previewVideoRefB.current;
      if (!activeVideo) return false;

      const currentSrc = activeVideo.src;
      const targetSrc = currentSegment.videoUrl ?? '';
      if (!targetSrc) return false;
      const srcMatches = currentSrc && (
        currentSrc === targetSrc ||
        currentSrc.endsWith(new URL(targetSrc, window.location.href).pathname)
      );

      if (srcMatches) {
        activeVideo.play().catch(() => undefined);
        return true;
      }

      setIsPreviewVideoLoading(true);
      activeVideo.src = targetSrc;
      activeVideo.load();
      activeVideo.play().catch(() => undefined);
      return true;
    };

    if (setupAndPlayVideo()) return;

    let retryCount = 0;
    const maxRetries = 10;
    const retryInterval = setInterval(() => {
      retryCount += 1;
      if (setupAndPlayVideo() || retryCount >= maxRetries) {
        clearInterval(retryInterval);
      }
    }, 50);

    return () => clearInterval(retryInterval);
  }, [activeVideoSlot, currentPreviewIndex, isOpen, previewableSegments]);

  useEffect(() => {
    if (!isOpen || previewableSegments.length === 0) return;

    const safeIndex = Math.min(currentPreviewIndex, previewableSegments.length - 1);
    const currentSegment = previewableSegments[safeIndex];
    if (!currentSegment || currentSegment.hasVideo || !previewIsPlaying) {
      if (crossfadeTimerRef.current) {
        clearInterval(crossfadeTimerRef.current);
        crossfadeTimerRef.current = null;
      }
      return;
    }

    const segmentDuration = segmentDurations[safeIndex] || currentSegment.durationFromFrames || 2;
    const startTime = Date.now();
    const duration = segmentDuration * 1000;

    const audio = previewAudioRef.current;
    if (audio && isAudioEnabled && audioUrl) {
      const globalTime = getGlobalTime(safeIndex, 0);
      audio.currentTime = globalTime;
      audio.play().catch(() => undefined);
    }

    setCrossfadeProgress(0);
    setPreviewCurrentTime(0);
    setPreviewDuration(segmentDuration);

    if (crossfadeTimerRef.current) {
      clearInterval(crossfadeTimerRef.current);
    }

    crossfadeTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      setCrossfadeProgress(progress);
      setPreviewCurrentTime(progress * segmentDuration);

      if (progress >= 1) {
        clearInterval(crossfadeTimerRef.current!);
        crossfadeTimerRef.current = null;
        const nextIndex = (safeIndex + 1) % previewableSegments.length;
        setCurrentPreviewIndex(nextIndex);
      }
    }, 50);

    return () => {
      if (crossfadeTimerRef.current) {
        clearInterval(crossfadeTimerRef.current);
        crossfadeTimerRef.current = null;
      }
    };
  }, [
    audioUrl,
    currentPreviewIndex,
    getGlobalTime,
    isAudioEnabled,
    isOpen,
    previewIsPlaying,
    previewableSegments,
    segmentDurations,
  ]);

  const safeIndex = previewableSegments.length > 0
    ? Math.min(currentPreviewIndex, previewableSegments.length - 1)
    : 0;
  const currentSegment = previewableSegments[safeIndex] ?? null;

  const handlePlayPause = useCallback(() => {
    if (!currentSegment) return;

    if (currentSegment.hasVideo) {
      const video = activeVideoSlot === 'A' ? previewVideoRef.current : previewVideoRefB.current;
      if (video) {
        if (video.paused) {
          video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      }
      return;
    }

    setPreviewIsPlaying((previous) => {
      const nextPlaying = !previous;
      const audio = previewAudioRef.current;
      if (audio) {
        if (nextPlaying) {
          audio.play().catch(() => undefined);
        } else {
          audio.pause();
        }
      }
      return nextPlaying;
    });
  }, [activeVideoSlot, currentSegment]);

  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    setActiveVideoSlot('A');
    setPreloadedIndex(null);
    if (direction === 'prev') {
      setCurrentPreviewIndex((prev) => (prev > 0 ? prev - 1 : previewableSegments.length - 1));
    } else {
      setCurrentPreviewIndex((prev) => (prev + 1) % previewableSegments.length);
    }
  }, [previewableSegments.length]);

  const handleToggleAudio = useCallback(() => {
    if (!currentSegment) return;

    const newEnabled = !isAudioEnabled;
    setIsAudioEnabled(newEnabled);
    const audio = previewAudioRef.current;
    if (!audio) return;

    if (newEnabled && previewIsPlaying) {
      if (currentSegment.hasVideo) {
        syncAudioToVideo();
      } else {
        const globalTime = getGlobalTime(safeIndex, previewCurrentTime);
        audio.currentTime = globalTime;
        audio.play().catch(() => undefined);
      }
      return;
    }

    audio.pause();
  }, [
    currentSegment,
    getGlobalTime,
    isAudioEnabled,
    previewCurrentTime,
    previewIsPlaying,
    safeIndex,
    syncAudioToVideo,
  ]);

  const handleSeek = useCallback((newTime: number) => {
    if (!currentSegment?.hasVideo) return;
    const video = activeVideoSlot === 'A' ? previewVideoRef.current : previewVideoRefB.current;
    if (video) {
      video.currentTime = newTime;
      setPreviewCurrentTime(newTime);
    }
  }, [activeVideoSlot, currentSegment]);

  const handleSelectSegment = useCallback((segmentIndex: number) => {
    setActiveVideoSlot('A');
    setPreloadedIndex(null);
    setCurrentPreviewIndex(segmentIndex);
  }, []);

  const createVideoHandlers = useCallback((slot: VideoSlot): VideoHandlers => {
    if (!currentSegment) return NOOP_VIDEO_HANDLERS;

    const isActive = activeVideoSlot === slot;
    const videoRef = slot === 'A' ? previewVideoRef : previewVideoRefB;

    return {
      onClick: handlePlayPause,
      onPlay: () => {
        if (!isActive) return;
        setPreviewIsPlaying(true);
        if (previewAudioRef.current && isAudioEnabled && audioUrl) {
          syncAudioToVideo();
        }
      },
      onPause: () => {
        if (!isActive) return;
        setPreviewIsPlaying(false);
        previewAudioRef.current?.pause();
      },
      onTimeUpdate: () => {
        if (!isActive) return;
        const video = videoRef.current;
        if (video) {
          const scaledTime = video.currentTime / (video.playbackRate || 1);
          setPreviewCurrentTime(scaledTime);
        }
      },
      onSeeked: () => {
        if (isActive) syncAudioToVideo();
      },
      onLoadedMetadata: () => {
        if (!isActive) return;
        const video = videoRef.current;
        if (video) {
          const actualDuration = video.duration;
          const expectedDuration = currentSegment.durationFromFrames || actualDuration;
          if (expectedDuration > 0 && actualDuration > 0) {
            const playbackRate = actualDuration / expectedDuration;
            video.playbackRate = Math.max(0.25, Math.min(4, playbackRate));
          }
          setPreviewDuration(expectedDuration);
          setPreviewCurrentTime(0);
          setIsPreviewVideoLoading(false);
          syncAudioToVideo();
          video.play().catch(() => undefined);
        }
      },
      onEnded: () => {
        if (!isActive) return;
        const nextIndex = (safeIndex + 1) % previewableSegments.length;
        const nextSegment = previewableSegments[nextIndex];
        if (nextSegment?.hasVideo && preloadedIndex === nextIndex) {
          const newSlot: VideoSlot = slot === 'A' ? 'B' : 'A';
          setActiveVideoSlot(newSlot);
          setPreloadedIndex(null);
          const nextVideoRef = newSlot === 'A' ? previewVideoRef : previewVideoRefB;
          nextVideoRef.current?.play().catch(() => undefined);
        }
        setCurrentPreviewIndex(nextIndex);
      },
    };
  }, [
    activeVideoSlot,
    audioUrl,
    currentSegment,
    handlePlayPause,
    isAudioEnabled,
    preloadedIndex,
    previewableSegments,
    safeIndex,
    syncAudioToVideo,
  ]);

  return {
    currentPreviewIndex,
    previewIsPlaying,
    previewCurrentTime,
    previewDuration,
    isPreviewVideoLoading,
    isAudioEnabled,
    crossfadeProgress,
    activeVideoSlot,
    previewVideoRef,
    previewVideoRefB,
    previewAudioRef,
    previewThumbnailsRef,
    safeIndex,
    currentSegment,
    handlePlayPause,
    handleNavigate,
    createVideoHandlers,
    handleToggleAudio,
    handleSeek,
    handleSelectSegment,
  };
}
