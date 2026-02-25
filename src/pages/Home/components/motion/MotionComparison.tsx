import React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { getThumbPath } from './VideoWithPoster';
import { useMotionComparisonController } from '../motionComparison/useMotionComparisonController';
import { MotionComparisonOverlays } from '../motionComparison/MotionComparisonOverlays';

/**
 * Side-by-side comparison slider for motion reference vs result videos.
 * Playback logic and overlays are extracted to keep this component focused on layout.
 */
export const MotionComparison: React.FC = () => {
  const {
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
  } = useMotionComparisonController();

  return (
    <div
      ref={containerRef}
      className="relative w-full aspect-[4/3] rounded-lg overflow-hidden cursor-col-resize group select-none border border-muted/50 touch-none"
      onMouseMove={handleMouseMove}
      onTouchMove={handleTouchMove}
      onClick={togglePlay}
      onMouseLeave={resetSliderOnIdle}
    >
      <video
        ref={videoOutputRef}
        src="/motion-output.mp4"
        className="absolute inset-0 w-full h-full object-cover"
        loop
        muted={isMuted}
        playsInline
        preload="metadata"
        onTimeUpdate={handleTimeUpdate}
        onSeeked={handleOutputSeeked}
      />

      <img
        src={getThumbPath('/motion-output-poster.jpg')}
        alt=""
        className={cn('absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300', isPlaying && 'opacity-0')}
      />

      <div
        className={cn('absolute inset-0 overflow-hidden', isAnimating && 'transition-[clip-path] duration-500 ease-out')}
        style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
      >
        <video
          ref={videoInputRef}
          src="/motion-input.mp4"
          className="absolute inset-0 w-full h-full object-cover"
          loop
          muted={isMuted}
          playsInline
          preload="metadata"
          onLoadedMetadata={handleInputLoadedMetadata}
        />

        <img
          src={getThumbPath('/motion-input-poster.jpg')}
          alt=""
          className={cn('absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300', isPlaying && 'opacity-0')}
        />
      </div>

      <MotionComparisonOverlays
        isPlaying={isPlaying}
        isMuted={isMuted}
        isAnimating={isAnimating}
        sliderPos={sliderPos}
        fadeOpacity={fadeOpacity}
        onToggleMute={toggleMute}
      />
    </div>
  );
};
