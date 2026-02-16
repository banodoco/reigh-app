import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GlassSidePane } from './GlassSidePane';
import { cn } from '@/shared/lib/utils';
import { useTravelAutoAdvance } from './useTravelAutoAdvance';
import { getThumbPath } from './VideoWithPoster';
import { TravelSelector } from './TravelSelector';
import { MotionComparison } from './MotionComparison';

interface ExampleStyle {
  prompt: string;
  image1: string;
  image2: string;
  video: string;
}

interface PhilosophyPaneProps {
  isOpen: boolean;
  onClose: () => void;
  isClosing: boolean;
  isOpening: boolean;
  currentExample: ExampleStyle;
  navigate: (path: string) => void;
  selectedExampleStyle: string;
}

// Placeholder for dummy images/videos
const PLACEHOLDER = '/placeholder.svg';

// Skeleton component for loading states
const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn("animate-pulse bg-muted/50 rounded", className)} />
);

// Dummy data for the different sections
const travelExamples = [
  {
    id: '2-images',
    label: '2 Images',
    images: [PLACEHOLDER, PLACEHOLDER],
    video: PLACEHOLDER,
    poster: PLACEHOLDER,
  },
  {
    id: '4-images',
    label: '4 Images',
    images: ['/916-1.jpg', '/916-2.jpg', '/916-3.jpg', '/916-4.jpg'],
    video: '/916-output.mp4',
    poster: '/916-output-poster.jpg',
  },
  {
    id: '7-images',
    label: '7 Images',
    images: ['/h1-crop.webp', '/h2-crop.webp', '/h3-crop.webp', '/h4-crop.webp', '/h5-crop.webp', '/h6-crop.webp', '/h7-crop.webp'],
    video: '/h-output.mp4',
    poster: '/h-output-poster.jpg',
  },
];

export const PhilosophyPane: React.FC<PhilosophyPaneProps> = ({
  isOpen,
  onClose,
  isClosing,
  isOpening,
  currentExample,
  navigate,
  selectedExampleStyle,
}) => {
  const philosophyVideoRef = useRef<HTMLVideoElement | null>(null);
  const travelVideoRefs = useRef<(HTMLVideoElement | null)[]>([null, null, null]);
  const loraVideosRef = useRef<(HTMLVideoElement | null)[]>([]);

  // State for interactive sections
  const [selectedTravelExample, setSelectedTravelExample] = useState(0);
  const [loraPlaying, setLoraPlaying] = useState(false);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [loadedVideos, setLoadedVideos] = useState<Set<string>>(new Set());
  const loadedImagesRef = useRef<Set<string>>(new Set());

  // Auto-advance animation state (extracted to hook)
  const autoAdvance = useTravelAutoAdvance({
    totalExamples: travelExamples.length,
    onExampleChange: setSelectedTravelExample,
  });

  const handleImageLoad = useCallback((src: string) => {
    if (!loadedImagesRef.current.has(src)) {
      loadedImagesRef.current.add(src);
      setLoadedImages(prev => new Set(prev).add(src));
    }
  }, []);

  // Handle cached images that don't fire onLoad on mobile
  const handleImageRef = useCallback((img: HTMLImageElement | null, src: string) => {
    if (img && img.complete && img.naturalWidth > 0 && !loadedImagesRef.current.has(src)) {
      handleImageLoad(src);
    }
  }, [handleImageLoad]);

  const handleVideoLoad = useCallback((src: string) => {
    setLoadedVideos(prev => new Set(prev).add(src));
  }, []);

  // Destructure stable function references from the hook
  const {
    setVideoProgress,
    handleVideoStarted,
    handleVideoEnded: onVideoEnded,
    handleVideoTimeUpdate: onVideoTimeUpdate,
    handleManualSelect,
    resetAll,
  } = autoAdvance;

  const playTravelVideo = useCallback((idx: number) => {
    const video = travelVideoRefs.current[idx];
    if (video) {
      video.currentTime = 0;
      setVideoProgress(0);
      // Wait for video to actually start playing before hiding poster
      const onPlaying = () => {
        handleVideoStarted(idx);
        video.removeEventListener('playing', onPlaying);
      };
      video.addEventListener('playing', onPlaying);
      video.play().catch(() => {
        video.removeEventListener('playing', onPlaying);
      });
    }
  }, [setVideoProgress, handleVideoStarted]);

  const handleTravelVideoEnded = useCallback((idx: number) => {
    // Preload the next video during countdown so it's ready to play
    const nextIdx = (idx + 1) % travelExamples.length;
    const nextVideo = travelVideoRefs.current[nextIdx];
    if (nextVideo) {
      nextVideo.load();
    }
    onVideoEnded(idx);
  }, [onVideoEnded]);

  const handleVideoTimeUpdate = useCallback((idx: number, video: HTMLVideoElement) => {
    onVideoTimeUpdate(idx, video.currentTime, video.duration, selectedTravelExample);
  }, [onVideoTimeUpdate, selectedTravelExample]);

  const handleSelectExample = useCallback((idx: number) => {
    handleManualSelect(idx);
  }, [handleManualSelect]);

  const toggleLoraPlay = () => {
    if (loraPlaying) {
      // Pause
      setLoraPlaying(false);
      loraVideosRef.current.forEach(video => {
        if (video) video.pause();
      });
    } else {
      // Play - wait for video to actually start playing before hiding button
      const video = loraVideosRef.current[0];
      if (video) {
        video.currentTime = 0;
        const onPlaying = () => {
          setLoraPlaying(true);
          video.removeEventListener('playing', onPlaying);
        };
        video.addEventListener('playing', onPlaying);
        video.play().catch(() => {
          video.removeEventListener('playing', onPlaying);
        });
      }
    }
  };

  // Stop LoRA videos when closed
  useEffect(() => {
    if (!isOpen) {
      setLoraPlaying(false);
      loraVideosRef.current.forEach(video => {
        if (video) {
          video.pause();
          video.currentTime = 0;
        }
      });
    }
  }, [isOpen]);

  // Play travel video when pane finishes opening OR when switching tabs
  useEffect(() => {
    if (isOpen && !isOpening) {
      // Play the currently selected travel video
      playTravelVideo(selectedTravelExample);
    }
     
  }, [isOpen, isOpening, selectedTravelExample]);

  // Reset when pane closes
  useEffect(() => {
    if (!isOpen && !isClosing) {
      // Stop all travel videos when closed
      travelVideoRefs.current.forEach(video => {
        if (video) {
          video.pause();
          video.currentTime = 0;
        }
      });
      // Reset all animation state
      resetAll();
    }
     
  }, [isOpen, isClosing]);

  // Preload critical images when pane opens
  useEffect(() => {
    if (isOpen) {
      const imagesToPreload = [
        // Travel video posters
        currentExample.image1,
        currentExample.image2,
        '/916-output-poster.jpg',
        '/h-output-poster.jpg',
        // 4-image input images
        '/916-1.jpg', '/916-2.jpg', '/916-3.jpg', '/916-4.jpg',
        // 7-image input images
        '/h1-crop.webp', '/h2-crop.webp', '/h3-crop.webp', '/h4-crop.webp',
        '/h5-crop.webp', '/h6-crop.webp', '/h7-crop.webp',
        // LoRA section images
        '/lora-3.webp', '/lora-4.webp', '/lora-grid-combined-poster.jpg',
      ];
      imagesToPreload.forEach(src => {
        const img = new Image();
        img.onload = () => handleImageLoad(src);
        img.src = src;
        // If already cached, onload fires synchronously or check complete
        if (img.complete) handleImageLoad(src);
      });
    }
  }, [isOpen, currentExample.image1, currentExample.image2]);

  return (
    <GlassSidePane isOpen={isOpen} onClose={onClose} side="right" zIndex={60}>
      {/* Keyframes for border reveal/hide and fill drain - left to right wave */}
      <style>{`
        @keyframes revealBorderLeftToRight {
          from { clip-path: inset(0 100% 0 0); }
          to { clip-path: inset(0 0% 0 0); }
        }
        @keyframes hideBorderLeftToRight {
          from { clip-path: inset(0 0% 0 0); }
          to { clip-path: inset(0 0% 0 100%); }
        }
        @keyframes drainFillLeftToRight {
          from { clip-path: inset(0 0 0 0); }
          to { clip-path: inset(0 0 0 100%); }
        }
      `}</style>
      {/* Header */}
      <div className="mt-8 sm:mt-10 mb-6 relative z-10">
        <h2 className="text-2xl sm:text-3xl font-theme-heading text-primary leading-tight mb-5">
          reigh is a tool made just for travelling between images
        </h2>
        <div className="w-20 h-1.5 bg-gradient-to-r from-wes-vintage-gold to-wes-vintage-gold/50 rounded-full animate-pulse-breathe opacity-90"></div>
      </div>

      <div className="space-y-8 pb-1 text-left text-foreground/85 font-medium">
        {/* Intro text */}
        <div className="space-y-3">
          <p className="text-sm leading-7">
            There are many tools that aim to be a 'one-stop-shop' for creating with AI - a kind of 'Amazon for art'. 
          </p>
          <p className="text-sm leading-7">
            <span className="font-theme-heading">Reigh</span> is not one of them.
          </p>
          <p className="text-sm leading-7">
            It's a tool <span className="text-wes-vintage-gold">just for travelling between images</span>:
          </p>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 1: Basic Image Travel Demo
            - Selector below visualization, full width, each option 1/3
            - Fixed pixel sizes matching original layout
            - All images square:
              - 2 images: stacked vertically
              - 3 images: L-shape (2 stacked left, 1 top-right)
              - 4 images: 2x2 grid
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-2 !mt-4 mb-4">
          {/* Main travel visualization - fixed height container */}
          <div className="flex gap-4 items-center justify-center h-[210px] sm:h-[264px]">
            {/* Left side: Input images with dynamic layout */}
            {(() => {
              const images = selectedTravelExample === 0 
                ? [currentExample.image1, currentExample.image2]
                : travelExamples[selectedTravelExample].images;
              const imageCount = images.length;
              
              // 2 images: stacked vertically
              if (imageCount === 2) {
                return (
                  <div className="flex flex-col gap-2">
                    {images.map((img, idx) => {
                      const imgSrc = selectedTravelExample === 0 ? img : PLACEHOLDER;
                      return (
                        <div key={idx} className="w-20 h-20 sm:w-32 sm:h-32 flex-shrink-0 relative">
                          {!loadedImages.has(imgSrc) && <Skeleton className="absolute inset-0 rounded-lg" />}
                          <img 
                            ref={(img) => handleImageRef(img, imgSrc)}
                            src={imgSrc}
                            alt={`Input image ${idx + 1}`}
                            className={cn("w-full h-full object-cover border rounded-lg transition-opacity duration-300", !loadedImages.has(imgSrc) && "opacity-0")}
                            onLoad={() => handleImageLoad(imgSrc)}
                          />
                        </div>
                      );
                    })}
                  </div>
                );
              }
              
              // 7 images: row of images at top, video below
              if (imageCount === 7) {
                const example = travelExamples[selectedTravelExample];
                return (
                  <div className="flex flex-col gap-2 items-center justify-end h-full">
                    {/* 7 input images in a row */}
                    <div className="flex gap-1">
                      {images.map((img, idx) => (
                        <div key={idx} className="w-[40px] h-[30px] sm:w-[56px] sm:h-[42px] flex-shrink-0 overflow-hidden rounded border relative">
                          {/* Thumbnail loads first */}
                          <img 
                            src={getThumbPath(img)}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          {/* Full image fades in on top when loaded */}
                          <img 
                            ref={(imgEl) => handleImageRef(imgEl, img)}
                            src={img}
                            alt={`Input image ${idx + 1}`}
                            className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", !loadedImages.has(img) && "opacity-0")}
                            onLoad={() => handleImageLoad(img)}
                          />
                        </div>
                      ))}
                    </div>
                    {/* 4:3 output video */}
                    <div 
                      className="w-[240px] h-[172px] sm:w-[296px] sm:h-[212px] flex-shrink-0 relative overflow-hidden rounded-lg border"
                      style={{ transform: 'translateZ(0)', willChange: 'transform' }}
                    >
                      <video
                        ref={(el) => { travelVideoRefs.current[2] = el; }}
                        src={example.video}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                        onTimeUpdate={(e) => handleVideoTimeUpdate(2, e.currentTarget)}
                        onEnded={() => handleTravelVideoEnded(2)}
                      />
                      {/* Thumbnail - only show before first play */}
                      <img
                        src={getThumbPath(example.poster)}
                        alt=""
                        className={cn(
                          "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300",
                          (!autoAdvance.videoEnded.has(2) || autoAdvance.videoPlayed.has(2)) && "opacity-0"
                        )}
                      />
                      {/* Full poster - only show before first play */}
                      <img
                        ref={(imgEl) => handleImageRef(imgEl, example.poster)}
                        src={example.poster}
                        alt=""
                        onLoad={() => handleImageLoad(example.poster)}
                        className={cn(
                          "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300",
                          (!autoAdvance.videoEnded.has(2) || autoAdvance.videoPlayed.has(2) || !loadedImages.has(example.poster)) && "opacity-0"
                        )}
                      />
                      {/* Play button overlay */}
                      <button
                        onClick={() => playTravelVideo(2)}
                        className={cn(
                          "absolute inset-0 bg-black/40 flex items-center justify-center text-white hover:bg-black/50 transition-all duration-300",
                          autoAdvance.videoEnded.has(2) ? "opacity-100" : "opacity-0 pointer-events-none"
                        )}
                      >
                        <svg className="w-8 h-8 sm:w-12 sm:h-12" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              }
              
              // 4 images: 2x2 grid on left, 9:16 output on right
              if (imageCount === 4) {
                const example = travelExamples[selectedTravelExample];
                return (
                  <div className="flex gap-2 items-center">
                    {/* 4 input images in 2x2 grid, 9:16 aspect */}
                    <div className="grid grid-cols-2 gap-1">
                      {images.map((img, idx) => (
                        <div key={idx} className="w-[42px] h-[75px] sm:w-[73px] sm:h-[130px] flex-shrink-0 overflow-hidden rounded-lg border relative">
                          {/* Thumbnail loads first */}
                          <img 
                            src={getThumbPath(img)}
                            alt=""
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          {/* Full image fades in on top when loaded */}
                          <img 
                            ref={(imgEl) => handleImageRef(imgEl, img)}
                            src={img}
                            alt={`Input image ${idx + 1}`}
                            className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", !loadedImages.has(img) && "opacity-0")}
                            onLoad={() => handleImageLoad(img)}
                          />
                        </div>
                      ))}
                    </div>
                    {/* 9:16 output video */}
                    <div 
                      className="w-[117px] h-[208px] sm:w-[148px] sm:h-[264px] flex-shrink-0 relative overflow-hidden rounded-lg border"
                      style={{ transform: 'translateZ(0)', willChange: 'transform' }}
                    >
                      <video 
                        ref={(el) => { travelVideoRefs.current[1] = el; }}
                        src={example.video}
                        muted
                        playsInline
                        preload="metadata"
                        className="w-full h-full object-cover"
                        onTimeUpdate={(e) => handleVideoTimeUpdate(1, e.currentTarget)}
                        onEnded={() => handleTravelVideoEnded(1)}
                      />
                      {/* Thumbnail - only show before first play */}
                      <img
                        src={getThumbPath(example.poster)}
                        alt=""
                        className={cn(
                          "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300",
                          (!autoAdvance.videoEnded.has(1) || autoAdvance.videoPlayed.has(1)) && "opacity-0"
                        )}
                      />
                      {/* Full poster - only show before first play */}
                      <img
                        ref={(imgEl) => handleImageRef(imgEl, example.poster)}
                        src={example.poster}
                        alt=""
                        onLoad={() => handleImageLoad(example.poster)}
                        className={cn(
                          "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300",
                          (!autoAdvance.videoEnded.has(1) || autoAdvance.videoPlayed.has(1) || !loadedImages.has(example.poster)) && "opacity-0"
                        )}
                      />
                      {/* Play button overlay */}
                      <button
                        onClick={() => playTravelVideo(1)}
                        className={cn(
                          "absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center text-white hover:bg-black/50 transition-all duration-300",
                          autoAdvance.videoEnded.has(1) ? "opacity-100" : "opacity-0 pointer-events-none"
                        )}
                      >
                        <svg className="w-8 h-8 sm:w-12 sm:h-12" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              }
              
              return null;
            })()}
            
            {/* Right side: Output video - fixed size (hidden for 4-image and 7-image layouts which have their own) */}
            {selectedTravelExample === 0 && (
            <div 
              className="w-[168px] h-[168px] sm:w-[264px] sm:h-[264px] flex-shrink-0 relative overflow-hidden rounded-lg border"
              style={{ transform: 'translateZ(0)', willChange: 'transform' }}
            >
              <video 
                key={selectedExampleStyle}
                ref={(video) => {
                  philosophyVideoRef.current = video;
                  travelVideoRefs.current[0] = video;
                }}
                src={currentExample.video}
                muted
                playsInline
                preload="auto"
                crossOrigin="anonymous"
                disableRemotePlayback
                onTimeUpdate={(e) => handleVideoTimeUpdate(0, e.currentTarget)}
                onEnded={() => handleTravelVideoEnded(0)}
                className="w-full h-full object-cover"
              />
              {/* Thumbnail - only show before first play */}
              <img
                src={getThumbPath(currentExample.image1)}
                alt=""
                className={cn(
                  "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300",
                  (!autoAdvance.videoEnded.has(0) || autoAdvance.videoPlayed.has(0)) && "opacity-0"
                )}
              />
              {/* Full poster - only show before first play */}
              <img
                ref={(imgEl) => handleImageRef(imgEl, currentExample.image1)}
                src={currentExample.image1}
                alt=""
                onLoad={() => handleImageLoad(currentExample.image1)}
                className={cn(
                  "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300",
                  (!autoAdvance.videoEnded.has(0) || autoAdvance.videoPlayed.has(0) || !loadedImages.has(currentExample.image1)) && "opacity-0"
                )}
              />
              {/* Play button overlay */}
              <button
                onClick={() => playTravelVideo(0)}
                className={cn(
                  "absolute inset-0 bg-black/40 flex items-center justify-center text-white hover:bg-black/50 transition-all duration-300",
                  autoAdvance.videoEnded.has(0) ? "opacity-100" : "opacity-0 pointer-events-none"
                )}
              >
                <svg className="w-8 h-8 sm:w-12 sm:h-12" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z"/>
                </svg>
              </button>
            </div>
            )}
          </div>

          {/* Example selector with thumbnail previews - below visualization, full width */}
          <TravelSelector
            examples={travelExamples}
            selectedIndex={selectedTravelExample}
            onSelect={handleSelectExample}
            nextAdvanceIdx={autoAdvance.nextAdvanceIdx}
            prevAdvanceIdx={autoAdvance.prevAdvanceIdx}
            drainingIdx={autoAdvance.drainingIdx}
            videoProgress={autoAdvance.videoProgress}
            videoEnded={autoAdvance.videoEnded}
            loadedImages={loadedImages}
            onImageLoad={handleImageLoad}
            twoImageImages={[currentExample.image1, currentExample.image2]}
          />
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 2: Reference Videos for Motion Control
            - Images displayed above videos in rows
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-3">
          <p className="text-sm leading-7">
            You can use <span className="text-wes-vintage-gold">reference videos to steer the motion</span> - here's an example of how images and video references combine:
          </p>

          <div className="space-y-3">
            {/* Images row - displayed in a single row */}
            <div className="grid grid-cols-8 gap-1">
              {Array.from({ length: 16 }).map((_, idx) => {
                const imgNum = String(idx + 1).padStart(3, '0');
                const imgSrc = `/introduction-images/${imgNum}.${idx === 13 ? 'png' : 'jpg'}`;
                return (
                  <div key={idx} className="aspect-square bg-muted/30 rounded border border-muted/50 overflow-hidden relative">
                    {/* Thumbnail loads first */}
                    <img
                      src={getThumbPath(imgSrc)}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                    {/* Full image fades in on top when loaded */}
                    <img
                      ref={(imgEl) => handleImageRef(imgEl, imgSrc)}
                      src={imgSrc}
                      alt={`Input ${idx + 1}`}
                      className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", !loadedImages.has(imgSrc) && "opacity-0")}
                      onLoad={() => handleImageLoad(imgSrc)}
                    />
                  </div>
                );
              })}
            </div>

            {/* Video comparison row */}
            <div className="w-full">
              <MotionComparison />
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            SECTION 3: LoRA Selector for Motion Styles
            - Starting/ending images left, 2x2 video grid right
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-3">
          <p className="text-sm leading-7">
            You can also combine community-trained LoRAs to <span className="text-wes-vintage-gold">craft a truly unique style of motion</span>:
          </p>
          
          <div className="flex gap-4 items-center">
            {/* Left: Starting and ending images stacked */}
            <div className="flex flex-col gap-2">
              {/* Starting image - label above */}
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] italic text-muted-foreground/60">starting</span>
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border border-muted/50 relative">
                  {/* Thumbnail loads first */}
                  <img 
                    src={getThumbPath('/lora-3.webp')}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {/* Full image fades in on top when loaded */}
                  <img 
                    ref={(imgEl) => handleImageRef(imgEl, '/lora-3.webp')}
                    src="/lora-3.webp"
                    alt="starting image"
                    className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", !loadedImages.has('/lora-3.webp') && "opacity-0")}
                    onLoad={() => handleImageLoad('/lora-3.webp')}
                  />
                </div>
              </div>
              {/* Ending image - label below */}
              <div className="flex flex-col items-center gap-1">
                <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border border-muted/50 relative">
                  {/* Thumbnail loads first */}
                  <img 
                    src={getThumbPath('/lora-4.webp')}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                  {/* Full image fades in on top when loaded */}
                  <img 
                    ref={(imgEl) => handleImageRef(imgEl, '/lora-4.webp')}
                    src="/lora-4.webp"
                    alt="ending image"
                    className={cn("absolute inset-0 w-full h-full object-cover transition-opacity duration-300", !loadedImages.has('/lora-4.webp') && "opacity-0")}
                    onLoad={() => handleImageLoad('/lora-4.webp')}
                  />
                </div>
                <span className="text-[10px] italic text-muted-foreground/60">ending</span>
              </div>
            </div>
            
            {/* Right: 2x2 grid of videos with labels */}
            <div className="flex-1 relative min-w-0">
              <div className="aspect-square bg-muted/30 rounded-lg border border-muted/50 overflow-hidden relative">
                {!loadedVideos.has('/lora-grid-pingpong.mp4') && <Skeleton className="absolute inset-0 z-0" />}
                <video
                  ref={(el) => { if (el) loraVideosRef.current[0] = el; }}
                  src="/lora-grid-pingpong.mp4"
                  muted
                  playsInline
                  preload="auto"
                  onCanPlay={() => handleVideoLoad('/lora-grid-pingpong.mp4')}
                  onEnded={() => {
                    // Reset to start so poster fades in over matching frame
                    const video = loraVideosRef.current[0];
                    if (video) video.currentTime = 0;
                    setLoraPlaying(false);
                  }}
                  className="w-full h-full object-cover"
                />
                {/* Poster overlay - thumbnail loads first, full poster fades in */}
                <img 
                  src={getThumbPath('/lora-grid-combined-poster.jpg')}
                  alt=""
                  className={cn(
                    "absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300",
                    loraPlaying ? "opacity-0" : "opacity-100"
                  )}
                />
                <img 
                  ref={(imgEl) => handleImageRef(imgEl, '/lora-grid-combined-poster.jpg')}
                  src="/lora-grid-combined-poster.jpg"
                  alt=""
                  onLoad={() => handleImageLoad('/lora-grid-combined-poster.jpg')}
                  className={cn(
                    "absolute inset-0 w-full h-full object-cover transition-opacity duration-300 pointer-events-none",
                    loraPlaying || !loadedImages.has('/lora-grid-combined-poster.jpg') ? "opacity-0" : "opacity-100"
                  )}
                />
                
                {/* Labels overlay */}
                <div className="absolute inset-0 pointer-events-none">
                  {/* Top Left - Label Bottom Right */}
                  <div className="absolute top-0 left-0 w-1/2 h-1/2">
                    <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-tl z-10 w-20 h-8 flex items-center justify-center text-center leading-tight">
                      slow motion explode
                    </span>
                  </div>
                  
                  {/* Top Right - Label Bottom Left */}
                  <div className="absolute top-0 right-0 w-1/2 h-1/2">
                    <span className="absolute bottom-0 left-0 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-tr z-10 w-20 h-8 flex items-center justify-center text-center leading-tight">
                      animatediff
                    </span>
                  </div>
                  
                  {/* Bottom Left - Label Top Right */}
                  <div className="absolute bottom-0 left-0 w-1/2 h-1/2">
                    <span className="absolute top-0 right-0 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-bl z-10 w-20 h-8 flex items-center justify-center text-center leading-tight">
                      water morphing
                    </span>
                  </div>
                  
                  {/* Bottom Right - Label Top Left */}
                  <div className="absolute bottom-0 right-0 w-1/2 h-1/2">
                    <span className="absolute top-0 left-0 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-br z-10 w-20 h-8 flex items-center justify-center text-center leading-tight">
                      steampunk willy
                    </span>
                  </div>
                </div>
              </div>
              
              {/* Play button overlay */}
              {!loraPlaying && (
                <button
                  onClick={toggleLoraPlay}
                  className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 rounded-lg transition-all duration-300 z-20 group"
                >
                  <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm border border-white/50 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                    </svg>
                  </div>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            CLOSING SECTION
        ═══════════════════════════════════════════════════════════════════ */}
        <div className="space-y-3">
          <p className="text-sm leading-7">
            We believe that there's a world of creativity that's waiting to be discovered in the AI-driven journey between images and <span className="text-wes-vintage-gold"><span className="font-theme-heading">Reigh</span> is a tool just for exploring this artform.</span>
          </p>
          <p className="text-sm leading-7">
            And everything is open source - meaning <span className="text-wes-vintage-gold">you can run it for free on your computer</span>!
          </p>
        </div>

        {/* Divider */}
        <div className="w-16 h-px bg-foreground/20 my-2"></div>

        <div className="flex items-center gap-x-2">
          <button
            onClick={() => navigate('/tools')}
            className="text-muted-foreground hover:text-primary text-xs underline transition-colors duration-200"
          >
            Try the tool
          </button>
          <span className="text-muted-foreground/50">|</span>
          <a
            href="https://discord.gg/D5K2c6kfhy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary text-xs underline transition-colors duration-200"
          >
            Join the community
          </a>
        </div>
      </div>
    </GlassSidePane>
  );
};
