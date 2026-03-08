import React, { useRef, useCallback } from 'react';
import { formatTime } from '@/shared/lib/timeFormatting';
import { usePlayhead } from './hooks/usePlayhead';
import { useHandleDrag } from './hooks/useHandleDrag';
import { SelectionOverlay } from './components/SelectionOverlay';
import type { MultiPortionTimelineProps } from './types';

// Re-export public types and interfaces for external consumers
;
;

// Helper to format time with milliseconds (1 digit) for this component's use
const formatTimeWithMs = (seconds: number): string => {
  return formatTime(seconds, { showMilliseconds: true, millisecondsDigits: 1 });
};

// Timeline with multiple portion selections, thumbnails, and time labels
export function MultiPortionTimeline({
  duration,
  selections,
  activeSelectionId,
  onSelectionChange,
  onSelectionClick,
  videoRef,
  videoUrl,
  fps,
  maxGapFrames,
}: MultiPortionTimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Playhead tracking and scrubbing
  const {
    currentTime,
    startPlayheadDrag,
    handleScrubberInteraction,
  } = usePlayhead({ duration, videoRef, scrubberRef: trackRef });

  // Handle drag, tap-to-move, and selection interaction
  const {
    dragging,
    selectedHandle,
    dragOffsetRef,
    isDragExceedingMax,
    startDrag,
    handleHandleTap,
    handleTrackTap,
  } = useHandleDrag({
    duration,
    selections,
    fps,
    maxGapFrames,
    videoRef,
    trackRef,
    onSelectionChange,
    onSelectionClick,
  });

  // Handle click on track - differentiate between seeking and handle selection
  const handleTrackClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!selectedHandle) {
      handleScrubberInteraction(e as React.MouseEvent);
    } else {
      handleTrackTap(e);
    }
  }, [selectedHandle, handleScrubberInteraction, handleTrackTap]);

  return (
    <div className="relative pt-16 md:pt-12 pb-2 select-none">
      {/* Track */}
      <div
        ref={trackRef}
        className="relative h-8 md:h-6 bg-white/10 rounded cursor-pointer touch-none select-none"
        onClick={handleTrackClick}
        onTouchEnd={handleTrackClick}
        onMouseDown={(e) => {
          // Start playhead drag if clicking on empty area (not on a handle)
          const target = e.target as HTMLElement;
          if (!target.closest('[data-handle]')) {
            startPlayheadDrag(e);
          }
        }}
        onTouchStart={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest('[data-handle]')) {
            startPlayheadDrag(e);
          }
        }}
      >
        {/* Playhead - vertical line showing current position */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-white shadow-lg pointer-events-none z-20"
          style={{
            left: `${duration > 0 ? (currentTime / duration) * 100 : 0}%`,
            transform: 'translateX(-50%)',
          }}
        >
          {/* Playhead top handle */}
          <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-white rounded-full shadow" />
        </div>

        {/* Render each selection */}
        {selections.map((selection, index) => (
          <SelectionOverlay
            key={selection.id}
            selection={selection}
            index={index}
            isActive={selection.id === activeSelectionId}
            videoUrl={videoUrl}
            fps={fps}
            duration={duration}
            dragging={dragging}
            selectedHandle={selectedHandle}
            dragOffsetRef={dragOffsetRef}
            trackRef={trackRef}
            onStartDrag={startDrag}
            onHandleTap={handleHandleTap}
            onSelectionClick={onSelectionClick}
          />
        ))}
      </div>

      {/* Warning when selection exceeds max frames - only show during active drag that exceeds limit */}
      {isDragExceedingMax && maxGapFrames && (
        <div className="mt-1 px-2 py-1 bg-amber-500/20 border border-amber-500/40 rounded text-amber-200 text-xs text-center">
          You'll only be able to generate max {maxGapFrames} frames in this gap
        </div>
      )}

      {/* Timeline markers */}
      <div className="flex justify-between text-[10px] text-white/40 mt-1 px-1">
        <span>0:00</span>
        <span>{formatTimeWithMs(duration)}</span>
      </div>
    </div>
  );
}
