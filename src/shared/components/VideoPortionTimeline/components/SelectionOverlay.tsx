import React from 'react';
import { cn } from '@/shared/components/ui/contracts/cn';
import { formatTime } from '@/shared/lib/timeFormatting';
import type { PortionSelection, HandleDragState, DragOffset } from '../types';
import { SELECTION_COLORS } from '../types';
import { FrameThumbnail } from './FrameThumbnail';

// Helper to format time with milliseconds (1 digit) for this component's use
const formatTimeWithMs = (seconds: number): string => {
  return formatTime(seconds, { showMilliseconds: true, millisecondsDigits: 1 });
};

interface SelectionOverlayProps {
  selection: PortionSelection;
  index: number;
  isActive: boolean;
  videoUrl: string;
  fps: number | null;
  duration: number;
  dragging: HandleDragState | null;
  selectedHandle: HandleDragState | null;
  dragOffsetRef: React.RefObject<DragOffset | null>;
  trackRef: React.RefObject<HTMLDivElement | null>;
  onStartDrag: (e: React.MouseEvent | React.TouchEvent, id: string, handle: 'start' | 'end') => void;
  onHandleTap: (e: React.MouseEvent | React.TouchEvent, id: string, handle: 'start' | 'end') => void;
  onSelectionClick: (id: string | null) => void;
}

export function SelectionOverlay({
  selection,
  index,
  isActive,
  videoUrl,
  fps,
  duration,
  dragging,
  selectedHandle,
  dragOffsetRef,
  trackRef,
  onStartDrag,
  onHandleTap,
  onSelectionClick,
}: SelectionOverlayProps) {
  // Calculate base percentages
  let startPercent = (selection.start / duration) * 100;
  let endPercent = (selection.end / duration) * 100;

  // Apply drag offset for immediate visual feedback
  if (dragOffsetRef.current?.id === selection.id && trackRef.current) {
    const rect = trackRef.current.getBoundingClientRect();
    const trackWidth = rect.width;
    const offsetPercent = (dragOffsetRef.current.offsetPx / trackWidth) * 100;

    if (dragOffsetRef.current.handle === 'start') {
      startPercent = Math.max(0, Math.min(100, startPercent + offsetPercent));
      // Ensure start doesn't go past end
      startPercent = Math.min(startPercent, endPercent - 0.1);
    } else {
      endPercent = Math.max(0, Math.min(100, endPercent + offsetPercent));
      // Ensure end doesn't go before start
      endPercent = Math.max(endPercent, startPercent + 0.1);
    }
  }

  const colorClass = SELECTION_COLORS[index % SELECTION_COLORS.length];

  return (
    <React.Fragment>
      {/* Thumbnail and time above start handle */}
      <div
        className="absolute flex flex-col items-center pointer-events-none"
        style={{
          left: `${startPercent}%`,
          transform: 'translateX(-50%)',
          bottom: '100%',
          marginBottom: '4px'
        }}
      >
        <FrameThumbnail videoUrl={videoUrl} time={selection.start} />
        <div className="flex flex-col items-center mt-0.5">
          <span className="text-[10px] font-mono text-white/80 whitespace-nowrap">
            {formatTimeWithMs(selection.start)}
          </span>
          {fps && (
            <span className="text-[9px] font-mono text-white/50 whitespace-nowrap">
              f{Math.round(selection.start * fps)}
            </span>
          )}
        </div>
      </div>

      {/* Thumbnail and time above end handle */}
      <div
        className="absolute flex flex-col items-center pointer-events-none"
        style={{
          left: `${endPercent}%`,
          transform: 'translateX(-50%)',
          bottom: '100%',
          marginBottom: '4px'
        }}
      >
        <FrameThumbnail videoUrl={videoUrl} time={selection.end} />
        <div className="flex flex-col items-center mt-0.5">
          <span className="text-[10px] font-mono text-white/80 whitespace-nowrap">
            {formatTimeWithMs(selection.end)}
          </span>
          {fps && (
            <span className="text-[9px] font-mono text-white/50 whitespace-nowrap">
              f{Math.round(selection.end * fps)}
            </span>
          )}
        </div>
      </div>

      {/* Selected portion highlight */}
      <div
        className={cn(
          "absolute top-0 bottom-0 rounded cursor-pointer",
          colorClass,
          isActive ? "opacity-50" : "opacity-30",
          !isActive && "hover:opacity-50",
          // Remove transition during drag for instant feedback
          dragOffsetRef.current?.id !== selection.id ? "transition-opacity" : ""
        )}
        style={{
          left: `${startPercent}%`,
          width: `${endPercent - startPercent}%`,
          // Remove transition during drag
          transition: dragOffsetRef.current?.id === selection.id ? 'none' : undefined
        }}
        onClick={(e) => {
          e.stopPropagation();
          onSelectionClick(selection.id);
        }}
      />

      {/* Start handle - larger touch target on mobile, prevent text selection on iPad */}
      <div
        data-handle="start"
        className={cn(
          "absolute top-0 bottom-0 w-5 md:w-3 rounded-l cursor-ew-resize flex items-center justify-center z-10 touch-none select-none",
          colorClass,
          isActive ? "opacity-100" : "opacity-70 hover:opacity-100",
          selectedHandle?.id === selection.id && selectedHandle?.handle === 'start' && "ring-2 ring-white ring-offset-1 ring-offset-black scale-110",
          // Remove transition during drag for instant feedback
          dragging?.id !== selection.id || dragging?.handle !== 'start' ? "transition-all" : ""
        )}
        style={{
          left: `${startPercent}%`,
          transform: dragOffsetRef.current?.id === selection.id && dragOffsetRef.current?.handle === 'start'
            ? `translateX(calc(-50% + ${dragOffsetRef.current.offsetPx}px))`
            : 'translateX(-50%)',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
        }}
        onMouseDown={(e) => onStartDrag(e, selection.id, 'start')}
        onTouchStart={(e) => {
          e.preventDefault(); // Prevent text selection on iPad
          // On touch devices, use tap-to-select mode instead of drag
          onHandleTap(e, selection.id, 'start');
        }}
        onClick={(e) => {
          e.stopPropagation();
          onHandleTap(e, selection.id, 'start');
        }}
      >
        <div className="w-0.5 h-4 md:h-3 bg-white/50 rounded pointer-events-none" />
      </div>

      {/* End handle - larger touch target on mobile, prevent text selection on iPad */}
      <div
        data-handle="end"
        className={cn(
          "absolute top-0 bottom-0 w-5 md:w-3 rounded-r cursor-ew-resize flex items-center justify-center z-10 touch-none select-none",
          colorClass,
          isActive ? "opacity-100" : "opacity-70 hover:opacity-100",
          selectedHandle?.id === selection.id && selectedHandle?.handle === 'end' && "ring-2 ring-white ring-offset-1 ring-offset-black scale-110",
          // Remove transition during drag for instant feedback
          dragging?.id !== selection.id || dragging?.handle !== 'end' ? "transition-all" : ""
        )}
        style={{
          left: `${endPercent}%`,
          transform: dragOffsetRef.current?.id === selection.id && dragOffsetRef.current?.handle === 'end'
            ? `translateX(calc(-50% + ${dragOffsetRef.current.offsetPx}px))`
            : 'translateX(-50%)',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
        }}
        onMouseDown={(e) => onStartDrag(e, selection.id, 'end')}
        onTouchStart={(e) => {
          e.preventDefault(); // Prevent text selection on iPad
          // On touch devices, use tap-to-select mode instead of drag
          onHandleTap(e, selection.id, 'end');
        }}
        onClick={(e) => {
          e.stopPropagation();
          onHandleTap(e, selection.id, 'end');
        }}
      >
        <div className="w-0.5 h-4 md:h-3 bg-white/50 rounded pointer-events-none" />
      </div>
    </React.Fragment>
  );
}
