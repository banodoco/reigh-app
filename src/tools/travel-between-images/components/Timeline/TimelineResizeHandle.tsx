import React from 'react';

interface TimelineResizeHandleProps {
  side: 'left' | 'right';
  isActive: boolean;
  isSelected: boolean;
  showHint: boolean;
  margin: string;
  onMouseDown: (e: React.MouseEvent) => void;
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

/**
 * Resize handle for timeline strips (left or right edge).
 * Shows a pill-shaped drag handle with optional "tap to place" hint.
 */
export const TimelineResizeHandle: React.FC<TimelineResizeHandleProps> = ({
  side,
  isActive,
  isSelected,
  showHint,
  margin,
  onMouseDown,
  onTouchStart,
  onTouchEnd,
}) => {
  const positionClass = side === 'left' ? '-left-3' : '-right-3';
  const marginStyle = side === 'left' ? { marginLeft: margin } : { marginRight: margin };

  return (
    <div
      data-resize-handle={side}
      className={`absolute ${positionClass} top-5 bottom-1 w-6 z-40 flex items-center justify-center transition-opacity ${
        isActive ? 'opacity-100 cursor-ew-resize' : 'opacity-0 pointer-events-none'
      }`}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      style={marginStyle}
    >
      <div
        className={`w-1.5 h-14 rounded-full transition-all ${
          isSelected
            ? 'bg-orange-500 shadow-[0_0_0_4px_rgba(249,115,22,0.3)]'
            : 'bg-primary/60 hover:bg-primary'
        }`}
      />
      {/* Tap-to-place hint above handle */}
      {isSelected && showHint && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 z-50 pointer-events-none mb-1">
          <div className="bg-orange-500 text-white px-2 py-0.5 rounded text-[10px] font-medium shadow-md whitespace-nowrap">
            Tap to place
          </div>
        </div>
      )}
    </div>
  );
};
