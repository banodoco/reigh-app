import React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { getThumbPath } from '../../motion/VideoWithPoster';
import { TravelSelector } from '../../motion/TravelSelector';
import { MotionComparison } from '../../motion/MotionComparison';

export interface PhilosophyExampleStyle {
  prompt: string;
  image1: string;
  image2: string;
  video: string;
}

export interface PhilosophyTravelExample {
  id: string;
  label: string;
  images: string[];
  video: string;
  poster: string;
}

interface PhilosophyAutoAdvance {
  nextAdvanceIdx: number | null;
  prevAdvanceIdx: number | null;
  drainingIdx: number | null;
  videoProgress: number;
  videoEnded: Set<number>;
  videoPlayed: Set<number>;
}

export const PLACEHOLDER_MEDIA = '/placeholder.svg';

const Skeleton = ({ className }: { className?: string }) => (
  <div className={cn('animate-pulse bg-muted/50 rounded', className)} />
);

interface TravelVideoCardProps {
  containerClassName: string;
  videoRef: (el: HTMLVideoElement | null) => void;
  videoSrc: string;
  posterSrc: string;
  posterLoadKey: string;
  isEnded: boolean;
  isPlayed: boolean;
  isPosterLoaded: boolean;
  onPosterLoad: () => void;
  onPlay: () => void;
  onTimeUpdate: (video: HTMLVideoElement) => void;
  onEnded: () => void;
  videoKey?: string;
  preload?: 'auto' | 'metadata';
  crossOrigin?: 'anonymous' | 'use-credentials';
  disableRemotePlayback?: boolean;
  playButtonClassName?: string;
}

function TravelVideoCard({
  containerClassName,
  videoRef,
  videoSrc,
  posterSrc,
  posterLoadKey,
  isEnded,
  isPlayed,
  isPosterLoaded,
  onPosterLoad,
  onPlay,
  onTimeUpdate,
  onEnded,
  videoKey,
  preload = 'metadata',
  crossOrigin,
  disableRemotePlayback,
  playButtonClassName,
}: TravelVideoCardProps) {
  return (
    <div
      className={containerClassName}
      style={{ transform: 'translateZ(0)', willChange: 'transform' }}
    >
      <video
        key={videoKey}
        ref={videoRef}
        src={videoSrc}
        muted
        playsInline
        preload={preload}
        {...(crossOrigin ? { crossOrigin } : {})}
        {...(disableRemotePlayback ? { disableRemotePlayback: true } : {})}
        className="w-full h-full object-cover"
        onTimeUpdate={(event) => onTimeUpdate(event.currentTarget)}
        onEnded={onEnded}
      />
      <img
        src={getThumbPath(posterSrc)}
        alt=""
        className={cn(
          'absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300',
          (!isEnded || isPlayed) && 'opacity-0',
        )}
      />
      <img
        src={posterSrc}
        alt=""
        onLoad={onPosterLoad}
        className={cn(
          'absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300',
          (!isEnded || isPlayed || !isPosterLoaded) && 'opacity-0',
        )}
      />
      <button
        onClick={onPlay}
        className={cn(
          'absolute inset-0 bg-black/40 flex items-center justify-center text-white hover:bg-black/50 transition-all duration-300',
          isEnded ? 'opacity-100' : 'opacity-0 pointer-events-none',
          playButtonClassName,
        )}
      >
        <svg className="w-8 h-8 sm:w-12 sm:h-12" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z" />
        </svg>
      </button>
    </div>
  );
}

interface TravelDemoSectionProps {
  currentExample: PhilosophyExampleStyle;
  selectedExampleStyle: string;
  travelExamples: PhilosophyTravelExample[];
  selectedTravelExample: number;
  autoAdvance: PhilosophyAutoAdvance;
  loadedImages: Set<string>;
  philosophyVideoRef: React.RefObject<HTMLVideoElement | null>;
  travelVideoRefs: React.RefObject<Array<HTMLVideoElement | null>>;
  handleImageLoad: (src: string) => void;
  handleImageRef: (img: HTMLImageElement | null, src: string) => void;
  handleSelectExample: (idx: number) => void;
  handleVideoTimeUpdate: (idx: number, video: HTMLVideoElement) => void;
  handleTravelVideoEnded: (idx: number) => void;
  playTravelVideo: (idx: number) => void;
}

export function TravelDemoSection({
  currentExample,
  selectedExampleStyle,
  travelExamples,
  selectedTravelExample,
  autoAdvance,
  loadedImages,
  philosophyVideoRef,
  travelVideoRefs,
  handleImageLoad,
  handleImageRef,
  handleSelectExample,
  handleVideoTimeUpdate,
  handleTravelVideoEnded,
  playTravelVideo,
}: TravelDemoSectionProps) {
  return (
    <div className="space-y-2 !mt-4 mb-4">
      <div className="flex gap-4 items-center justify-center h-[210px] sm:h-[264px]">
        {(() => {
          const images = selectedTravelExample === 0
            ? [currentExample.image1, currentExample.image2]
            : travelExamples[selectedTravelExample].images;
          const imageCount = images.length;

          if (imageCount === 2) {
            return (
              <div className="flex flex-col gap-2">
                {images.map((img, idx) => {
                  const imgSrc = selectedTravelExample === 0 ? img : PLACEHOLDER_MEDIA;
                  return (
                    <div key={idx} className="w-20 h-20 sm:w-32 sm:h-32 flex-shrink-0 relative">
                      {!loadedImages.has(imgSrc) && <Skeleton className="absolute inset-0 rounded-lg" />}
                      <img
                        ref={(imgEl) => handleImageRef(imgEl, imgSrc)}
                        src={imgSrc}
                        alt={`Input image ${idx + 1}`}
                        className={cn(
                          'w-full h-full object-cover border rounded-lg transition-opacity duration-300',
                          !loadedImages.has(imgSrc) && 'opacity-0',
                        )}
                        onLoad={() => handleImageLoad(imgSrc)}
                      />
                    </div>
                  );
                })}
              </div>
            );
          }

          if (imageCount === 7) {
            const example = travelExamples[selectedTravelExample];
            return (
              <div className="flex flex-col gap-2 items-center justify-end h-full">
                <div className="flex gap-1">
                  {images.map((img, idx) => (
                    <div
                      key={idx}
                      className="w-[40px] h-[30px] sm:w-[56px] sm:h-[42px] flex-shrink-0 overflow-hidden rounded border relative"
                    >
                      <img
                        src={getThumbPath(img)}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <img
                        ref={(imgEl) => handleImageRef(imgEl, img)}
                        src={img}
                        alt={`Input image ${idx + 1}`}
                        className={cn(
                          'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
                          !loadedImages.has(img) && 'opacity-0',
                        )}
                        onLoad={() => handleImageLoad(img)}
                      />
                    </div>
                  ))}
                </div>
                <TravelVideoCard
                  containerClassName="w-[240px] h-[172px] sm:w-[296px] sm:h-[212px] flex-shrink-0 relative overflow-hidden rounded-lg border"
                  videoRef={(el) => {
                    travelVideoRefs.current[2] = el;
                  }}
                  videoSrc={example.video}
                  posterSrc={example.poster}
                  posterLoadKey={example.poster}
                  isEnded={autoAdvance.videoEnded.has(2)}
                  isPlayed={autoAdvance.videoPlayed.has(2)}
                  isPosterLoaded={loadedImages.has(example.poster)}
                  onPosterLoad={() => handleImageLoad(example.poster)}
                  onPlay={() => playTravelVideo(2)}
                  onTimeUpdate={(video) => handleVideoTimeUpdate(2, video)}
                  onEnded={() => handleTravelVideoEnded(2)}
                />
              </div>
            );
          }

          if (imageCount === 4) {
            const example = travelExamples[selectedTravelExample];
            return (
              <div className="flex gap-2 items-center">
                <div className="grid grid-cols-2 gap-1">
                  {images.map((img, idx) => (
                    <div
                      key={idx}
                      className="w-[42px] h-[75px] sm:w-[73px] sm:h-[130px] flex-shrink-0 overflow-hidden rounded-lg border relative"
                    >
                      <img
                        src={getThumbPath(img)}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      <img
                        ref={(imgEl) => handleImageRef(imgEl, img)}
                        src={img}
                        alt={`Input image ${idx + 1}`}
                        className={cn(
                          'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
                          !loadedImages.has(img) && 'opacity-0',
                        )}
                        onLoad={() => handleImageLoad(img)}
                      />
                    </div>
                  ))}
                </div>
                <TravelVideoCard
                  containerClassName="w-[117px] h-[208px] sm:w-[148px] sm:h-[264px] flex-shrink-0 relative overflow-hidden rounded-lg border"
                  videoRef={(el) => {
                    travelVideoRefs.current[1] = el;
                  }}
                  videoSrc={example.video}
                  posterSrc={example.poster}
                  posterLoadKey={example.poster}
                  isEnded={autoAdvance.videoEnded.has(1)}
                  isPlayed={autoAdvance.videoPlayed.has(1)}
                  isPosterLoaded={loadedImages.has(example.poster)}
                  onPosterLoad={() => handleImageLoad(example.poster)}
                  onPlay={() => playTravelVideo(1)}
                  onTimeUpdate={(video) => handleVideoTimeUpdate(1, video)}
                  onEnded={() => handleTravelVideoEnded(1)}
                  playButtonClassName="rounded-lg"
                />
              </div>
            );
          }

          return null;
        })()}

        {selectedTravelExample === 0 && (
          <TravelVideoCard
            containerClassName="w-[168px] h-[168px] sm:w-[264px] sm:h-[264px] flex-shrink-0 relative overflow-hidden rounded-lg border"
            videoKey={selectedExampleStyle}
            videoRef={(video) => {
              philosophyVideoRef.current = video;
              travelVideoRefs.current[0] = video;
            }}
            videoSrc={currentExample.video}
            posterSrc={currentExample.image1}
            posterLoadKey={currentExample.image1}
            isEnded={autoAdvance.videoEnded.has(0)}
            isPlayed={autoAdvance.videoPlayed.has(0)}
            isPosterLoaded={loadedImages.has(currentExample.image1)}
            onPosterLoad={() => handleImageLoad(currentExample.image1)}
            onPlay={() => playTravelVideo(0)}
            onTimeUpdate={(video) => handleVideoTimeUpdate(0, video)}
            onEnded={() => handleTravelVideoEnded(0)}
            preload="auto"
            crossOrigin="anonymous"
            disableRemotePlayback
          />
        )}
      </div>

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
  );
}

interface MotionReferenceSectionProps {
  loadedImages: Set<string>;
  handleImageLoad: (src: string) => void;
  handleImageRef: (img: HTMLImageElement | null, src: string) => void;
}

export function MotionReferenceSection({
  loadedImages,
  handleImageLoad,
  handleImageRef,
}: MotionReferenceSectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-7">
        You can use <span className="text-wes-vintage-gold">reference videos to steer the motion</span> - here's an example of how images and video references combine:
      </p>

      <div className="space-y-3">
        <div className="grid grid-cols-8 gap-1">
          {Array.from({ length: 16 }).map((_, idx) => {
            const imgNum = String(idx + 1).padStart(3, '0');
            const imgSrc = `/introduction-images/${imgNum}.${idx === 13 ? 'png' : 'jpg'}`;
            return (
              <div key={idx} className="aspect-square bg-muted/30 rounded border border-muted/50 overflow-hidden relative">
                <img
                  src={getThumbPath(imgSrc)}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <img
                  ref={(imgEl) => handleImageRef(imgEl, imgSrc)}
                  src={imgSrc}
                  alt={`Input ${idx + 1}`}
                  className={cn(
                    'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
                    !loadedImages.has(imgSrc) && 'opacity-0',
                  )}
                  onLoad={() => handleImageLoad(imgSrc)}
                />
              </div>
            );
          })}
        </div>

        <div className="w-full">
          <MotionComparison />
        </div>
      </div>
    </div>
  );
}

interface LoraStyleSectionProps {
  loraPlaying: boolean;
  loadedImages: Set<string>;
  loadedVideos: Set<string>;
  loraVideosRef: React.RefObject<Array<HTMLVideoElement | null>>;
  handleImageLoad: (src: string) => void;
  handleImageRef: (img: HTMLImageElement | null, src: string) => void;
  handleVideoLoad: (src: string) => void;
  handleLoraVideoEnded: () => void;
  toggleLoraPlay: () => void;
}

export function LoraStyleSection({
  loraPlaying,
  loadedImages,
  loadedVideos,
  loraVideosRef,
  handleImageLoad,
  handleImageRef,
  handleVideoLoad,
  handleLoraVideoEnded,
  toggleLoraPlay,
}: LoraStyleSectionProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm leading-7">
        You can also combine community-trained LoRAs to <span className="text-wes-vintage-gold">craft a truly unique style of motion</span>:
      </p>

      <div className="flex gap-4 items-center">
        <div className="flex flex-col gap-2">
          <div className="flex flex-col items-center gap-1">
            <span className="text-[10px] italic text-muted-foreground/60">starting</span>
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border border-muted/50 relative">
              <img
                src={getThumbPath('/lora-3.webp')}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
              <img
                ref={(imgEl) => handleImageRef(imgEl, '/lora-3.webp')}
                src="/lora-3.webp"
                alt="starting image"
                className={cn(
                  'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
                  !loadedImages.has('/lora-3.webp') && 'opacity-0',
                )}
                onLoad={() => handleImageLoad('/lora-3.webp')}
              />
            </div>
          </div>
          <div className="flex flex-col items-center gap-1">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border border-muted/50 relative">
              <img
                src={getThumbPath('/lora-4.webp')}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
              <img
                ref={(imgEl) => handleImageRef(imgEl, '/lora-4.webp')}
                src="/lora-4.webp"
                alt="ending image"
                className={cn(
                  'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
                  !loadedImages.has('/lora-4.webp') && 'opacity-0',
                )}
                onLoad={() => handleImageLoad('/lora-4.webp')}
              />
            </div>
            <span className="text-[10px] italic text-muted-foreground/60">ending</span>
          </div>
        </div>

        <div className="flex-1 relative min-w-0">
          <div className="aspect-square bg-muted/30 rounded-lg border border-muted/50 overflow-hidden relative">
            {!loadedVideos.has('/lora-grid-pingpong.mp4') && <Skeleton className="absolute inset-0 z-0" />}
            <video
              ref={(el) => {
                if (el) {
                  loraVideosRef.current[0] = el;
                }
              }}
              src="/lora-grid-pingpong.mp4"
              muted
              playsInline
              preload="auto"
              onCanPlay={() => handleVideoLoad('/lora-grid-pingpong.mp4')}
              onEnded={handleLoraVideoEnded}
              className="w-full h-full object-cover"
            />
            <img
              src={getThumbPath('/lora-grid-combined-poster.jpg')}
              alt=""
              className={cn(
                'absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300',
                loraPlaying ? 'opacity-0' : 'opacity-100',
              )}
            />
            <img
              ref={(imgEl) => handleImageRef(imgEl, '/lora-grid-combined-poster.jpg')}
              src="/lora-grid-combined-poster.jpg"
              alt=""
              onLoad={() => handleImageLoad('/lora-grid-combined-poster.jpg')}
              className={cn(
                'absolute inset-0 w-full h-full object-cover transition-opacity duration-300 pointer-events-none',
                loraPlaying || !loadedImages.has('/lora-grid-combined-poster.jpg') ? 'opacity-0' : 'opacity-100',
              )}
            />

            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 left-0 w-1/2 h-1/2">
                <span className="absolute bottom-0 right-0 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-tl z-10 w-20 h-8 flex items-center justify-center text-center leading-tight">
                  slow motion explode
                </span>
              </div>
              <div className="absolute top-0 right-0 w-1/2 h-1/2">
                <span className="absolute bottom-0 left-0 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-tr z-10 w-20 h-8 flex items-center justify-center text-center leading-tight">
                  animatediff
                </span>
              </div>
              <div className="absolute bottom-0 left-0 w-1/2 h-1/2">
                <span className="absolute top-0 right-0 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-bl z-10 w-20 h-8 flex items-center justify-center text-center leading-tight">
                  water morphing
                </span>
              </div>
              <div className="absolute bottom-0 right-0 w-1/2 h-1/2">
                <span className="absolute top-0 left-0 bg-black/70 text-white text-[10px] px-1.5 py-0.5 rounded-br z-10 w-20 h-8 flex items-center justify-center text-center leading-tight">
                  steampunk willy
                </span>
              </div>
            </div>
          </div>

          {!loraPlaying && (
            <button
              onClick={toggleLoraPlay}
              className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/40 rounded-lg transition-all duration-300 z-20 group"
            >
              <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-sm border border-white/50 flex items-center justify-center group-hover:scale-105 transition-transform">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </div>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface PhilosophyClosingSectionProps {
  navigate: (path: string) => void;
}

export function PhilosophyClosingSection({ navigate }: PhilosophyClosingSectionProps) {
  return (
    <>
      <div className="space-y-3">
        <p className="text-sm leading-7">
          We believe that there's a world of creativity that's waiting to be discovered in the AI-driven journey between images and <span className="text-wes-vintage-gold"><span className="font-theme-heading">Reigh</span> is a tool just for exploring this artform.</span>
        </p>
        <p className="text-sm leading-7">
          And everything is open source - meaning <span className="text-wes-vintage-gold">you can run it for free on your computer</span>!
        </p>
      </div>

      <div className="w-16 h-px bg-foreground/20 my-2" />

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
    </>
  );
}
