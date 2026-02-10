/**
 * PreviewTogetherDialog - Video preview dialog for playing all segments sequentially.
 *
 * Features:
 * - Dual video elements for seamless cuts between segments
 * - Crossfade animation for image-only segments
 * - Audio sync across segments
 * - Keyboard navigation (arrow keys)
 * - Auto-scroll thumbnail strip
 */

import {
  useState,
  useCallback,
  useRef,
  useEffect
} from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/shared/components/ui/dialog';
import { Button } from "@/shared/components/ui/button";
import { Skeleton } from '@/shared/components/ui/skeleton';
import { Play, Pause, ChevronLeft, ChevronRight, Volume2, VolumeX, Expand } from "lucide-react";

export interface PreviewSegment {
  hasVideo: boolean;
  videoUrl: string | null;
  thumbUrl: string | null;
  startImageUrl: string | null;
  endImageUrl: string | null;
  index: number;
  durationFromFrames: number;
}

export interface PreviewTogetherDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  previewableSegments: PreviewSegment[];
  projectAspectRatio?: string;
  audioUrl?: string | null;
  onOpenInLightbox?: (segmentIndex: number) => void;
  /** When set, open the dialog starting at this pair index instead of 0 */
  initialPairIndex?: number | null;
}

export function PreviewTogetherDialog({
  isOpen,
  onOpenChange,
  previewableSegments,
  projectAspectRatio,
  audioUrl,
  onOpenInLightbox,
  initialPairIndex,
}: PreviewTogetherDialogProps) {
  // Core state
  const [currentPreviewIndex, setCurrentPreviewIndex] = useState(0);
  const [previewIsPlaying, setPreviewIsPlaying] = useState(true);
  const [previewCurrentTime, setPreviewCurrentTime] = useState(0);
  const [previewDuration, setPreviewDuration] = useState(0);
  const [isPreviewVideoLoading, setIsPreviewVideoLoading] = useState(true);

  // Audio sync state
  const [segmentDurations, setSegmentDurations] = useState<number[]>([]);
  const [segmentOffsets, setSegmentOffsets] = useState<number[]>([]);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);

  // Crossfade state
  const [crossfadeProgress, setCrossfadeProgress] = useState(0);
  const crossfadeTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Dual video elements for seamless cuts
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewVideoRefB = useRef<HTMLVideoElement>(null);
  const previewAudioRef = useRef<HTMLAudioElement>(null);
  const previewThumbnailsRef = useRef<HTMLDivElement>(null);
  const [activeVideoSlot, setActiveVideoSlot] = useState<'A' | 'B'>('A');
  const [preloadedIndex, setPreloadedIndex] = useState<number | null>(null);
  const preloadingIndexRef = useRef<number | null>(null);

  // Reset state when dialog closes
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

  // Jump to initial pair index when dialog opens with one specified
  useEffect(() => {
    if (isOpen && initialPairIndex != null && previewableSegments.length > 0) {
      const targetIdx = previewableSegments.findIndex(s => s.index === initialPairIndex);
      if (targetIdx >= 0) {
        setCurrentPreviewIndex(targetIdx);
      }
    }
  }, [isOpen, initialPairIndex, previewableSegments]);

  // Auto-start playback when dialog opens or segment changes
  useEffect(() => {
    if (isOpen) {
      setPreviewIsPlaying(true);
    }
  }, [isOpen, currentPreviewIndex]);

  // Helper to calculate global time across all segments
  const getGlobalTime = useCallback((segmentIndex: number, timeInSegment: number) => {
    if (segmentOffsets.length === 0 || segmentIndex >= segmentOffsets.length) return 0;
    return segmentOffsets[segmentIndex] + timeInSegment;
  }, [segmentOffsets]);

  // Sync audio to video
  const syncAudioToVideo = useCallback(() => {
    const video = previewVideoRef.current;
    const audio = previewAudioRef.current;
    if (!video || !audio || !isAudioEnabled || !audioUrl) return;

    const scaledVideoTime = video.currentTime / (video.playbackRate || 1);
    const globalTime = getGlobalTime(currentPreviewIndex, scaledVideoTime);
    audio.currentTime = globalTime;

    if (!video.paused) {
      audio.play().catch(() => {});
    }
  }, [currentPreviewIndex, getGlobalTime, isAudioEnabled, audioUrl]);

  // Calculate segment durations and offsets
  useEffect(() => {
    if (!isOpen || previewableSegments.length === 0) return;

    const durations = previewableSegments.map(segment =>
      segment.durationFromFrames || 2
    );

    const offsets: number[] = [0];
    for (let i = 0; i < durations.length - 1; i++) {
      offsets.push(offsets[i] + durations[i]);
    }

    setSegmentDurations(durations);
    setSegmentOffsets(offsets);
  }, [isOpen, previewableSegments]);

  // Auto-scroll thumbnail strip
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
      behavior: 'smooth'
    });
  }, [isOpen, currentPreviewIndex, previewableSegments.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isTyping = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );
      if (isTyping) return;

      if (previewableSegments.length === 0) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setActiveVideoSlot('A');
        setPreloadedIndex(null);
        setCurrentPreviewIndex(prev =>
          prev > 0 ? prev - 1 : previewableSegments.length - 1
        );
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setActiveVideoSlot('A');
        setPreloadedIndex(null);
        setCurrentPreviewIndex(prev =>
          (prev + 1) % previewableSegments.length
        );
      }
    };

    document.addEventListener('keydown', handleKeyDown, true); // capture phase — fires before dialog internals swallow the event
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, previewableSegments.length]);

  // Preload next video for seamless cuts
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
        retryCount++;
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
  }, [isOpen, currentPreviewIndex, previewableSegments, activeVideoSlot, preloadedIndex]);

  // Set active video src and start playback
  useEffect(() => {
    if (!isOpen || previewableSegments.length === 0) return;

    const safeIndex = Math.min(currentPreviewIndex, previewableSegments.length - 1);
    const currentSegment = previewableSegments[safeIndex];

    if (!currentSegment?.hasVideo || !currentSegment.videoUrl) return;

    const setupAndPlayVideo = () => {
      const activeVideo = activeVideoSlot === 'A' ? previewVideoRef.current : previewVideoRefB.current;
      if (!activeVideo) return false;

      const currentSrc = activeVideo.src;
      const targetSrc = currentSegment.videoUrl;
      const srcMatches = currentSrc && (currentSrc === targetSrc || currentSrc.endsWith(new URL(targetSrc, window.location.href).pathname));

      if (srcMatches) {
        activeVideo.play().catch(() => {});
        return true;
      }

      setIsPreviewVideoLoading(true);
      activeVideo.src = currentSegment.videoUrl;
      activeVideo.load();
      activeVideo.play().catch(() => {});
      return true;
    };

    if (setupAndPlayVideo()) return;

    let retryCount = 0;
    const maxRetries = 10;
    const retryInterval = setInterval(() => {
      retryCount++;
      if (setupAndPlayVideo() || retryCount >= maxRetries) {
        clearInterval(retryInterval);
      }
    }, 50);

    return () => clearInterval(retryInterval);
  }, [isOpen, currentPreviewIndex, previewableSegments, activeVideoSlot]);

  // Crossfade animation for image-only segments
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

    // Sync audio at start
    const audio = previewAudioRef.current;
    if (audio && isAudioEnabled && audioUrl) {
      const globalTime = getGlobalTime(safeIndex, 0);
      audio.currentTime = globalTime;
      audio.play().catch(() => {});
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
  }, [isOpen, currentPreviewIndex, previewableSegments, previewIsPlaying, segmentDurations, isAudioEnabled, audioUrl, getGlobalTime]);

  if (previewableSegments.length === 0) {
    return (
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl w-full p-0 gap-0 overflow-hidden">
          <DialogHeader className="sr-only">
            <DialogTitle>Preview Segments</DialogTitle>
          </DialogHeader>
          <div className="p-4">
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              No segments available to preview
            </div>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  const safeIndex = Math.min(currentPreviewIndex, previewableSegments.length - 1);
  const currentSegment = previewableSegments[safeIndex];

  const previewAspectStyle = (() => {
    if (!projectAspectRatio) return { aspectRatio: '16/9' };
    const [w, h] = projectAspectRatio.split(':').map(Number);
    if (w && h) return { aspectRatio: `${w}/${h}` };
    return { aspectRatio: '16/9' };
  })();

  const handlePlayPause = () => {
    if (currentSegment.hasVideo) {
      const video = activeVideoSlot === 'A' ? previewVideoRef.current : previewVideoRefB.current;
      if (video) {
        if (video.paused) {
          video.play();
        } else {
          video.pause();
        }
      }
    } else {
      setPreviewIsPlaying(prev => {
        const newPlaying = !prev;
        const audio = previewAudioRef.current;
        if (audio) {
          if (newPlaying) {
            audio.play().catch(() => {});
          } else {
            audio.pause();
          }
        }
        return newPlaying;
      });
    }
  };

  const handleNavigate = (direction: 'prev' | 'next') => {
    setActiveVideoSlot('A');
    setPreloadedIndex(null);
    if (direction === 'prev') {
      setCurrentPreviewIndex(prev =>
        prev > 0 ? prev - 1 : previewableSegments.length - 1
      );
    } else {
      setCurrentPreviewIndex(prev =>
        (prev + 1) % previewableSegments.length
      );
    }
  };

  const createVideoHandlers = (slot: 'A' | 'B') => {
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
          video.play().catch(() => {});
        }
      },
      onEnded: () => {
        if (!isActive) return;
        const nextIndex = (safeIndex + 1) % previewableSegments.length;
        const nextSegment = previewableSegments[nextIndex];
        if (nextSegment?.hasVideo && preloadedIndex === nextIndex) {
          const newSlot = slot === 'A' ? 'B' : 'A';
          setActiveVideoSlot(newSlot);
          setPreloadedIndex(null);
          const nextVideoRef = newSlot === 'A' ? previewVideoRef : previewVideoRefB;
          nextVideoRef.current?.play().catch(() => {});
        }
        setCurrentPreviewIndex(nextIndex);
      },
    };
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-full p-0 gap-0 overflow-hidden">
        <DialogHeader className="sr-only">
          <DialogTitle>Preview Segments</DialogTitle>
        </DialogHeader>
        <div className="p-4 overflow-hidden">
          <div className="flex flex-col gap-4 overflow-hidden">
            {/* Video container */}
            <div className="flex justify-center w-full">
              <div
                className="relative bg-black rounded-lg overflow-hidden max-w-full h-[60vh]"
                style={previewAspectStyle}
              >
                {/* Loading skeleton */}
                {currentSegment.hasVideo && isPreviewVideoLoading && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Skeleton className="w-full h-full bg-muted/20" />
                  </div>
                )}

                {/* Dual video elements */}
                {currentSegment.hasVideo && (
                  <>
                    <video
                      ref={previewVideoRef}
                      className={`absolute inset-0 w-full h-full object-contain cursor-pointer ${activeVideoSlot === 'A' ? 'z-10' : 'z-0 pointer-events-none'}`}
                      playsInline
                      muted={activeVideoSlot !== 'A'}
                      {...createVideoHandlers('A')}
                    />
                    <video
                      ref={previewVideoRefB}
                      className={`absolute inset-0 w-full h-full object-contain cursor-pointer ${activeVideoSlot === 'B' ? 'z-10' : 'z-0 pointer-events-none'}`}
                      playsInline
                      muted={activeVideoSlot !== 'B'}
                      {...createVideoHandlers('B')}
                    />
                  </>
                )}

                {/* Open in Lightbox button */}
                {currentSegment.hasVideo && onOpenInLightbox && (
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenInLightbox(currentSegment.index);
                    }}
                    className="absolute top-3 right-3 z-20 bg-black/50 hover:bg-black/70 text-white rounded-lg h-9 w-9"
                    title="Open in lightbox"
                  >
                    <Expand className="h-4 w-4" />
                  </Button>
                )}

                {/* Image crossfade */}
                {!currentSegment.hasVideo && (
                  <div className="absolute inset-0 cursor-pointer" onClick={handlePlayPause}>
                    {currentSegment.startImageUrl && (
                      <img
                        src={currentSegment.startImageUrl}
                        alt="Start"
                        className="absolute inset-0 w-full h-full object-contain"
                        style={{
                          opacity: 1 - crossfadeProgress,
                          transition: 'opacity 100ms ease-out'
                        }}
                      />
                    )}
                    {currentSegment.endImageUrl && (
                      <img
                        src={currentSegment.endImageUrl}
                        alt="End"
                        className="absolute inset-0 w-full h-full object-contain"
                        style={{
                          opacity: crossfadeProgress,
                          transition: 'opacity 100ms ease-out'
                        }}
                      />
                    )}
                    <div className="absolute top-3 left-3 px-2 py-1 rounded bg-black/50 text-white text-xs">
                      Crossfade (no video)
                    </div>
                    {!previewIsPlaying && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="bg-black/50 rounded-full p-4">
                          <Play className="h-8 w-8 text-white" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Hidden audio element */}
                {audioUrl && (
                  <audio
                    ref={previewAudioRef}
                    src={audioUrl}
                    preload="auto"
                    style={{ display: 'none' }}
                  />
                )}

                {/* Navigation arrows */}
                {previewableSegments.length > 1 && (
                  <>
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNavigate('prev');
                      }}
                      className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10"
                    >
                      <ChevronLeft className="h-6 w-6" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="lg"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNavigate('next');
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white z-20 h-10 w-10"
                    >
                      <ChevronRight className="h-6 w-6" />
                    </Button>
                  </>
                )}

                {/* Controls overlay */}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-8 z-20">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlayPause();
                      }}
                      className="w-10 h-10 rounded-full bg-white/20 backdrop-blur-sm text-white flex items-center justify-center hover:bg-white/30 transition-colors"
                    >
                      {previewIsPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </button>

                    {audioUrl && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const newEnabled = !isAudioEnabled;
                          setIsAudioEnabled(newEnabled);
                          const audio = previewAudioRef.current;
                          if (audio) {
                            if (newEnabled && previewIsPlaying) {
                              if (currentSegment.hasVideo) {
                                syncAudioToVideo();
                              } else {
                                const globalTime = getGlobalTime(safeIndex, previewCurrentTime);
                                audio.currentTime = globalTime;
                                audio.play().catch(() => {});
                              }
                            } else {
                              audio.pause();
                            }
                          }
                        }}
                        className={`w-10 h-10 rounded-full backdrop-blur-sm text-white flex items-center justify-center transition-colors ${
                          isAudioEnabled ? 'bg-white/20 hover:bg-white/30' : 'bg-white/10 hover:bg-white/20'
                        }`}
                        title={isAudioEnabled ? 'Mute audio' : 'Unmute audio'}
                      >
                        {isAudioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
                      </button>
                    )}

                    <span className="text-white text-sm tabular-nums min-w-[85px]">
                      {Math.floor(previewCurrentTime / 60)}:{Math.floor(previewCurrentTime % 60).toString().padStart(2, '0')} / {Math.floor(previewDuration / 60)}:{Math.floor(previewDuration % 60).toString().padStart(2, '0')}
                    </span>

                    <div className="flex-1 relative h-4 flex items-center">
                      <div className="absolute inset-x-0 h-1.5 bg-white/30 rounded-full" />
                      <div
                        className="absolute left-0 h-1.5 bg-white rounded-full"
                        style={{ width: `${(previewCurrentTime / (previewDuration || 1)) * 100}%` }}
                      />
                      <div
                        className="absolute w-3 h-3 bg-white rounded-full shadow-md cursor-pointer"
                        style={{
                          left: `calc(${(previewCurrentTime / (previewDuration || 1)) * 100}% - 6px)`,
                        }}
                      />
                      <input
                        type="range"
                        min={0}
                        max={previewDuration || 100}
                        step={0.1}
                        value={previewCurrentTime}
                        onChange={(e) => {
                          e.stopPropagation();
                          if (currentSegment.hasVideo) {
                            const video = activeVideoSlot === 'A' ? previewVideoRef.current : previewVideoRefB.current;
                            if (video) {
                              const newTime = parseFloat(e.target.value);
                              video.currentTime = newTime;
                              setPreviewCurrentTime(newTime);
                            }
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Thumbnail strip */}
            <div
              ref={previewThumbnailsRef}
              className="overflow-x-auto w-full no-scrollbar"
            >
              <div className="flex gap-2 p-3">
                {previewableSegments.map((segment, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`relative flex-shrink-0 transition-all duration-200 rounded-lg overflow-hidden ${
                      idx === safeIndex
                        ? 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                    style={{ width: 64, height: 36 }}
                    onClick={() => {
                      setActiveVideoSlot('A');
                      setPreloadedIndex(null);
                      setCurrentPreviewIndex(idx);
                    }}
                    aria-label={`Go to segment ${segment.index + 1}`}
                  >
                    <img
                      src={segment.thumbUrl || segment.startImageUrl || ''}
                      alt={`Segment ${segment.index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {!segment.hasVideo && (
                      <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <span className="text-[8px] text-white">IMG</span>
                      </div>
                    )}
                    <span className="absolute bottom-0.5 right-1 text-[10px] font-bold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                      {segment.index + 1}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
