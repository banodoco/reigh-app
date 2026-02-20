import {
  useRef,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { GenerationRow } from '@/types/shots';
import { useIsMobile, useIsTablet } from '@/shared/hooks/use-mobile';
import { useProject } from '@/shared/contexts/ProjectContext';
import { Button } from '@/shared/components/ui/button';
import {
  Play,
  Pause,
  Scissors,
  RefreshCw,
  X,
  Sparkles
} from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { TooltipProvider } from '@/shared/components/ui/tooltip';
import { useQueryClient } from '@tanstack/react-query';
import { unifiedGenerationQueryKeys } from '@/shared/lib/queryKeys/unified';
import { formatTime } from '@/shared/components/VideoPortionTimeline';
import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';
import { TrimControlsPanel } from '@/shared/components/VideoTrimEditor';
import { useVideoTrimming, useTrimSave } from '@/shared/components/VideoTrimEditor';
import { ModeSelector } from '@/shared/components/MediaLightbox/components/ModeSelector';
import { VideoEnhanceForm } from '@/shared/components/MediaLightbox/components/VideoEnhanceForm';
import { useVideoEnhance } from '@/shared/components/MediaLightbox/hooks/useVideoEnhance';
import { DEFAULT_ENHANCE_SETTINGS } from '@/shared/components/MediaLightbox/hooks/editSettingsTypes';
import type { VideoEnhanceSettings } from '@/shared/components/MediaLightbox/hooks/editSettingsTypes';
import {
  useReplaceMode,
  ReplaceVideoOverlay,
  ReplaceTimeline,
  ReplacePanelContent,
} from './VideoReplaceMode';

// Default FPS for AI-generated videos
const DEFAULT_VIDEO_FPS = 16;

interface InlineEditVideoViewProps {
  media: GenerationRow;
  onClose: () => void;
  onVideoSaved?: (newVideoUrl: string) => Promise<void>;
  onNavigateToGeneration?: (generationId: string) => Promise<void>;
  initialSegments?: PortionSelection[];
  onSegmentsChange?: (segments: PortionSelection[]) => void;
}

export function InlineEditVideoView({
  media,
  onClose,
  initialSegments,
  onSegmentsChange,
}: InlineEditVideoViewProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  // Use stacked layout for both mobile and tablet - video on top, settings below
  const useStackedLayout = isMobile || isTablet;
  const { selectedProjectId } = useProject();
  const queryClient = useQueryClient();

  // Video edit sub-mode state: 'trim', 'replace', or 'enhance'
  const [videoEditSubMode, setVideoEditSubMode] = useState<'trim' | 'replace' | 'enhance'>('replace');

  // Get video URL
  const videoUrl = media.location || media.imageUrl || null;

  // Video duration and FPS state
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoFps, setVideoFps] = useState<number | null>(null);
  const [fpsDetectionStatus, setFpsDetectionStatus] = useState<'pending' | 'detecting' | 'detected' | 'fallback'>('pending');

  // Current video playhead time for overlay display
  const [currentVideoTime, setCurrentVideoTime] = useState(0);

  // Progressive loading: show thumbnail first, then video when ready
  const [videoReady, setVideoReady] = useState(false);
  const thumbnailUrl = media.thumbnail_url || media.thumbUrl;

  // Track if video is playing
  const [isPlaying, setIsPlaying] = useState(false);

  // --- Trim mode state ---
  const {
    trimState,
    setStartTrim,
    setEndTrim,
    resetTrim,
    setVideoDuration: setTrimVideoDuration,
    trimmedDuration,
    hasTrimChanges,
  } = useVideoTrimming();

  const {
    isSaving: isSavingTrim,
    saveProgress: trimSaveProgress,
    saveError: trimSaveError,
    saveSuccess: trimSaveSuccess,
    saveTrimmedVideo,
  } = useTrimSave({
    generationId: media.id,
    projectId: selectedProjectId,
    sourceVideoUrl: videoUrl ?? '',
    trimState,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: unifiedGenerationQueryKeys.projectPrefix(selectedProjectId) });
    },
  });

  // --- Enhance mode state ---
  const [enhanceSettings, setEnhanceSettings] = useState<VideoEnhanceSettings>(DEFAULT_ENHANCE_SETTINGS);

  const videoEnhance = useVideoEnhance({
    projectId: selectedProjectId || undefined,
    videoUrl: videoUrl || undefined,
    generationId: media.id,
    settings: enhanceSettings,
    updateSettings: (updates) => setEnhanceSettings(prev => ({ ...prev, ...updates })),
  });

  // --- Replace mode state (extracted to hook) ---
  const replaceState = useReplaceMode({
    media,
    videoUrl,
    videoDuration,
    videoFps,
    initialSegments,
    onSegmentsChange,
  });

  // --- Shared video event tracking ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      setCurrentVideoTime(video.currentTime);
    };
    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);
    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, []);

  // Handle video metadata loaded - set FPS and ensure paused
  const handleVideoLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      // Ensure video is paused immediately
      videoRef.current.pause();

      // Mark video as ready to show (hide thumbnail)
      setVideoReady(true);

      const duration = videoRef.current.duration;
      if (Number.isFinite(duration) && duration > 0) {
        setVideoDuration(duration);
        setTrimVideoDuration(duration); // Also set for trim mode

        // Set FPS to default (16fps is standard for AI-generated videos)
        if (fpsDetectionStatus === 'pending') {
          setVideoFps(DEFAULT_VIDEO_FPS);
          setFpsDetectionStatus('detected');
        }
      }
    }
  }, [fpsDetectionStatus, setTrimVideoDuration]);

  if (!media) return null;

  return (
    <TooltipProvider>
      <div className={cn(
        "w-full bg-background",
        useStackedLayout ? "flex flex-col" : "h-full flex flex-row"
      )}>
        {/* Left side: Video + Timeline (stacked vertically) */}
        <div className={cn(
          "flex flex-col min-h-0",
          useStackedLayout ? "w-full" : "flex-1 h-full"
        )}>
          {/* Video Display Area - constrained height on desktop to leave room for timeline */}
          <div className={cn(
            "relative flex items-center justify-center bg-zinc-900 overflow-hidden",
            useStackedLayout ? "w-full" : "flex-shrink rounded-t-lg"
          )}>
            {/* Playhead info overlay - top left of video */}
            {videoReady && videoDuration > 0 && (
              <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 text-[11px] font-mono text-white/80 bg-black/50 backdrop-blur-sm rounded px-2 py-1">
                {formatTime(currentVideoTime)}
                {videoFps && <span className="text-white/50 ml-1">f{Math.round(currentVideoTime * videoFps)}</span>}
                {/* Segment info overlay (shows keep/segment badge) */}
                <ReplaceVideoOverlay
                  currentVideoTime={currentVideoTime}
                  selections={replaceState.selections}
                  onRemoveSelection={replaceState.handleRemoveSelection}
                />
              </div>
            )}

            {/* Play/Pause button overlay - center, shows on hover (desktop only) */}
            {videoReady && !useStackedLayout && (
              <button
                onClick={() => {
                  const video = videoRef.current;
                  if (!video) return;
                  if (video.paused) {
                    video.play().catch(() => {});
                  } else {
                    video.pause();
                  }
                }}
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-16 h-16 flex items-center justify-center rounded-full bg-black/50 text-white/80 hover:bg-black/70 hover:text-white transition-all opacity-0 hover:opacity-100 focus:opacity-100"
              >
                {isPlaying ? <Pause className="w-8 h-8" /> : <Play className="w-8 h-8 ml-1" />}
              </button>
            )}

            {/* Video Player with progressive loading - thumbnail first, then video */}
            <div className={cn(
              "w-full flex items-center justify-center relative",
              useStackedLayout
                ? isTablet
                  ? "p-2 pt-12 max-h-[35vh]" // Constrained height on iPad/tablet
                  : "p-2 pt-20 aspect-video" // Mobile
                : "p-4 pt-24" // Desktop
            )}>
              {/* Thumbnail shown while video loads */}
              {thumbnailUrl && !videoReady && (
                <img
                  src={thumbnailUrl}
                  alt="Video thumbnail"
                  className={cn(
                    "max-w-full object-contain rounded-lg",
                    useStackedLayout
                      ? isTablet
                        ? "max-h-[30vh]"
                        : "max-h-full"
                      : "max-h-[40vh]"
                  )}
                />
              )}

              {/* Video element - hidden until ready if thumbnail is showing */}
              <video
                ref={videoRef}
                src={videoUrl ?? undefined}
                controls={false} // Hide controls
                playsInline // Prevents fullscreen on iOS when video plays
                poster={thumbnailUrl} // Fallback poster
                className={cn(
                  "max-w-full object-contain rounded-lg cursor-pointer",
                  "[&::-webkit-media-controls-play-button]:hidden [&::-webkit-media-controls-start-playback-button]:hidden",
                  useStackedLayout
                    ? isTablet
                      ? "max-h-[30vh]" // Smaller on tablet
                      : "max-h-full"
                    : "max-h-[40vh]", // Slightly smaller than original to accommodate buffer
                  // Hide video until ready if we have a thumbnail showing
                  thumbnailUrl && !videoReady ? "absolute opacity-0 pointer-events-none" : ""
                )}
                style={{
                  // Additional CSS to hide native controls overlay
                  WebkitAppearance: 'none',
                }}
                onLoadedMetadata={handleVideoLoadedMetadata}
                preload="metadata"
                // Prevent double-click fullscreen on mobile/tablet
                onDoubleClick={useStackedLayout ? (e) => e.preventDefault() : undefined}
                // Click to play/pause on all devices
                onClick={(e) => {
                  e.preventDefault();
                  const video = e.currentTarget;
                  if (video.paused) {
                    video.play().catch(() => {
                      // Ignore play errors (e.g., user interaction required)
                    });
                  } else {
                    video.pause();
                  }
                }}
              />
            </div>
          </div>

          {/* Spacer between video and timeline on desktop - only in replace mode */}
          {!useStackedLayout && videoDuration > 0 && videoEditSubMode === 'replace' && <div className="h-4 bg-zinc-900" />}

          {/* Timeline Section - only in replace mode */}
          {videoEditSubMode === 'replace' && (
            <ReplaceTimeline
              videoDuration={videoDuration}
              selections={replaceState.selections}
              activeSelectionId={replaceState.activeSelectionId}
              onSelectionChange={replaceState.handleUpdateSelection}
              onSelectionClick={replaceState.setActiveSelectionId}
              onRemoveSelection={replaceState.handleRemoveSelection}
              onAddSelection={replaceState.handleAddSelection}
              videoRef={videoRef}
              videoUrl={videoUrl}
              videoFps={videoFps}
              contextFrameCount={replaceState.contextFrameCount}
              useStackedLayout={useStackedLayout}
            />
          )}
        </div>

        {/* Settings Panel */}
        <div className={cn(
          "bg-background overflow-y-auto flex flex-col",
          useStackedLayout ? "w-full border-t border-border" : "w-[40%] border-l border-border"
        )}>
          {/* Panel Header with Mode Selector and Close Button */}
          <div className={cn(
            "flex items-center justify-between border-b border-border bg-background flex-shrink-0",
            isMobile ? "px-3 py-2 gap-2" : "p-4 gap-3"
          )}>
            {/* Mode Selector */}
            <div className="flex-1">
              <ModeSelector
                items={[
                  {
                    id: 'trim',
                    label: 'Trim',
                    icon: <Scissors className="w-4 h-4" />,
                    onClick: () => setVideoEditSubMode('trim'),
                  },
                  {
                    id: 'replace',
                    label: 'Replace',
                    icon: <RefreshCw className="w-4 h-4" />,
                    onClick: () => setVideoEditSubMode('replace'),
                  },
                  {
                    id: 'enhance',
                    label: 'Enhance',
                    icon: <Sparkles className="w-4 h-4" />,
                    onClick: () => setVideoEditSubMode('enhance'),
                  },
                ]}
                activeId={videoEditSubMode}
              />
            </div>

            {/* Close Button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className={cn("p-0 hover:bg-muted flex-shrink-0", isMobile ? "h-7 w-7" : "h-8 w-8")}
            >
              <X className={cn(isMobile ? "h-3.5 w-3.5" : "h-4 w-4")} />
            </Button>
          </div>

          {/* Panel Content - conditionally render based on mode */}
          <div className="flex-1 overflow-y-auto">
            {videoEditSubMode === 'trim' && (
              <TrimControlsPanel
                trimState={trimState}
                onStartTrimChange={setStartTrim}
                onEndTrimChange={setEndTrim}
                onResetTrim={resetTrim}
                trimmedDuration={trimmedDuration}
                hasTrimChanges={hasTrimChanges}
                onSave={saveTrimmedVideo}
                isSaving={isSavingTrim}
                saveProgress={trimSaveProgress}
                saveError={trimSaveError}
                saveSuccess={trimSaveSuccess}
                onClose={onClose}
                variant={isMobile ? 'mobile' : 'desktop'}
                videoUrl={videoUrl || ''}
                currentTime={currentVideoTime}
                videoRef={videoRef}
                hideHeader
              />
            )}
            {videoEditSubMode === 'replace' && (
              <ReplacePanelContent
                replaceState={replaceState}
                videoUrl={videoUrl}
                videoFps={videoFps}
                selectedProjectId={selectedProjectId}
              />
            )}
            {videoEditSubMode === 'enhance' && (
              <VideoEnhanceForm
                settings={videoEnhance.settings}
                onUpdateSetting={videoEnhance.updateSetting}
                onGenerate={videoEnhance.handleGenerate}
                isGenerating={videoEnhance.isGenerating}
                generateSuccess={videoEnhance.generateSuccess}
                canSubmit={videoEnhance.canSubmit}
                variant={isMobile ? 'mobile' : 'desktop'}
                videoUrl={videoUrl ?? undefined}
              />
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
