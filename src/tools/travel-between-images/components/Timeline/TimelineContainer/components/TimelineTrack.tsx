import React from 'react';
import { TIMELINE_HORIZONTAL_PADDING } from '../../constants';

interface TimelineTrackProps {
  timelineRef: React.RefObject<HTMLDivElement>;
  containerRef: React.RefObject<HTMLDivElement>;
  zoomLevel: number;
  isFileOver: boolean;
  hasNoImages: boolean;
  enableTapToMove: boolean;
  selectedCount: number;
  onDragEnter: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent, containerRef: React.RefObject<HTMLDivElement>) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent, containerRef: React.RefObject<HTMLDivElement>) => void;
  onContainerDoubleClick: (e: React.MouseEvent, containerRef: React.RefObject<HTMLDivElement>) => void;
  onContainerClick: (e: React.MouseEvent) => void;
  containerWidth: number;
  prelude?: React.ReactNode;
  children: React.ReactNode;
}

export const TimelineTrack: React.FC<TimelineTrackProps> = ({
  timelineRef,
  containerRef,
  zoomLevel,
  isFileOver,
  enableTapToMove,
  selectedCount,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
  onContainerDoubleClick,
  onContainerClick,
  prelude,
  children,
}) => {
  return (
    <div
      ref={timelineRef}
      className={`timeline-scroll relative bg-muted/20 border rounded-lg px-5 overflow-x-auto ${zoomLevel <= 1 ? 'no-scrollbar' : ''} ${isFileOver ? 'ring-2 ring-primary bg-primary/5' : ''}`}
      style={{ minHeight: '240px', paddingTop: '2.5rem', paddingBottom: '7.5rem' }}
      onDragEnter={onDragEnter}
      onDragOver={(e) => onDragOver(e, containerRef)}
      onDragLeave={onDragLeave}
      onDrop={(e) => onDrop(e, containerRef)}
    >
      {prelude}

      <div
        ref={containerRef}
        id="timeline-container"
        className="relative h-36 mt-3 mb-2"
        onDoubleClick={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest('[data-item-id]') && !target.closest('button')) {
            onContainerDoubleClick(e, containerRef);
          }
        }}
        onClick={onContainerClick}
        style={{
          width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
          minWidth: '100%',
          userSelect: 'none',
          paddingLeft: `${TIMELINE_HORIZONTAL_PADDING}px`,
          paddingRight: `${TIMELINE_HORIZONTAL_PADDING + 60}px`,
          cursor: enableTapToMove && selectedCount > 0 ? 'crosshair' : 'default',
        }}
      >
        {children}
      </div>
    </div>
  );
};
