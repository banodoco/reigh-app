import React, { useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { VideoMetadata } from '@/shared/lib/videoUploader';
import { TIMELINE_HORIZONTAL_PADDING, TIMELINE_PADDING_OFFSET } from './constants';
import { TimelineResizeHandle } from './TimelineResizeHandle';
import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { X } from 'lucide-react';
import { useDeviceDetection } from '@/shared/hooks/useDeviceDetection';
import { useTemporaryVisibility } from '@/shared/hooks/useTemporaryVisibility';
import { useVideoMetadata } from '@/shared/hooks/useVideoMetadata';
import { useVideoFrameExtraction } from '@/shared/hooks/useVideoFrameExtraction';
import { useClickOutside } from '@/shared/hooks/useClickOutside';
import { useTimelineStripDrag } from './hooks/useTimelineStripDrag';
import { useVideoHoverPreview } from '@/shared/hooks/useVideoHoverPreview';

interface GuidanceVideoStripProps {
  videoUrl: string;
  videoMetadata: VideoMetadata | null;
  treatment: 'adjust' | 'clip';
  onTreatmentChange: (treatment: 'adjust' | 'clip') => void;
  onRemove: () => void;
  onMetadataExtracted?: (metadata: VideoMetadata) => void;
  // Timeline coordinate system
  fullMin: number;
  fullMax: number;
  fullRange: number;
  containerWidth: number;
  zoomLevel: number;
  // Timeline dimensions
  timelineFrameCount: number;
  readOnly?: boolean;

  // Output range - where in timeline this video is positioned
  outputStartFrame?: number;
  outputEndFrame?: number;

  // Source range - which frames from source video to use
  sourceStartFrame?: number;
  sourceEndFrame?: number | null;

  // Callbacks for range changes
  onRangeChange?: (startFrame: number, endFrame: number) => void;
  onSourceRangeChange?: (sourceStartFrame: number, sourceEndFrame: number | null) => void;

  // Position absolutely within parent (for multi-video same-row layout)
  useAbsolutePosition?: boolean;

  // Sibling video ranges for collision detection
  siblingRanges?: Array<{ start: number; end: number }>;
}

/**
 * Calculate which video frame to display based on cursor position and treatment mode
 */
const calculateAdjustModeFrame = (
  cursorPixelX: number,
  containerWidth: number,
  fullMin: number,
  fullMax: number,
  videoMetadata: VideoMetadata | null
): number => {
  if (!videoMetadata) return 0;

  const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
  const normalizedX = Math.max(0, Math.min(1, (cursorPixelX - TIMELINE_PADDING_OFFSET) / effectiveWidth));
  const videoFrame = Math.floor(normalizedX * videoMetadata.total_frames);

  return Math.max(0, Math.min(videoFrame, videoMetadata.total_frames - 1));
};

const calculateClipModeFrame = (
  cursorPixelX: number,
  containerWidth: number,
  fullMin: number,
  fullMax: number,
  videoMetadata: VideoMetadata | null
): number => {
  if (!videoMetadata) return 0;

  const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
  const normalizedX = Math.max(0, Math.min(1, (cursorPixelX - TIMELINE_PADDING_OFFSET) / effectiveWidth));
  const timelineFrame = fullMin + (normalizedX * (fullMax - fullMin));
  const videoFrame = Math.floor(timelineFrame);

  if (videoFrame < 0) return 0;
  if (videoFrame >= videoMetadata.total_frames) return videoMetadata.total_frames - 1;

  return videoFrame;
};

export const GuidanceVideoStrip: React.FC<GuidanceVideoStripProps> = ({
  videoUrl,
  videoMetadata,
  treatment,
  onTreatmentChange,
  onRemove,
  onMetadataExtracted,
  fullMin,
  fullMax,
  fullRange,
  containerWidth,
  zoomLevel,
  timelineFrameCount,
  readOnly = false,
  outputStartFrame,
  outputEndFrame,
  sourceStartFrame,
  sourceEndFrame,
  onRangeChange,
  onSourceRangeChange,
  useAbsolutePosition = false,
  siblingRanges = [],
}) => {
  // Calculate effective output range
  const effectiveOutputStart = outputStartFrame ?? fullMin;
  const effectiveOutputEnd = outputEndFrame ?? fullMax;
  const outputFrameCount = effectiveOutputEnd - effectiveOutputStart;

  const stripContainerRef = useRef<HTMLDivElement>(null);
  const outerContainerRef = useRef<HTMLDivElement>(null);
  const [currentTimelineFrame, setCurrentTimelineFrame] = useState(0);

  // Tablet tap-to-select state for endpoints
  const { isTablet } = useDeviceDetection();
  const [selectedEndpoint, setSelectedEndpoint] = useState<'left' | 'right' | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const SCROLL_THRESHOLD = 10;

  // Active state for handles visibility
  const [isStripActive, setIsStripActive] = useState(false);
  const lastTapTimeRef = useRef<number>(0);
  const DOUBLE_TAP_DELAY = 300;

  // Temporary visibility hooks
  const tapPreview = useTemporaryVisibility(2000);
  const tapToPlaceHint = useTemporaryVisibility(2000);

  // Get video metadata (extracts from URL if not provided)
  const { metadata: effectiveMetadata } = useVideoMetadata(videoUrl, videoMetadata, {
    onExtracted: onMetadataExtracted,
  });

  const totalVideoFrames = effectiveMetadata?.total_frames || 0;

  // Calculate effective source range
  const effectiveSourceStart = sourceStartFrame ?? 0;
  const effectiveSourceEnd = sourceEndFrame ?? totalVideoFrames;
  const sourceFrameCount = Math.max(0, effectiveSourceEnd - effectiveSourceStart);

  // Use drag hook for strip movement/resize
  const {
    isDragging,
    displayStart: displayOutputStart,
    displayEnd: displayOutputEnd,
    handleDragStart,
  } = useTimelineStripDrag({
    startFrame: effectiveOutputStart,
    endFrame: effectiveOutputEnd,
    fullRange,
    fullMin,
    fullMax,
    containerWidth,
    zoomLevel,
    siblingRanges,
    disabled: readOnly || !onRangeChange,
    onRangeChange,
    onTreatmentChange,
    treatment,
    videoTotalFrames: totalVideoFrames,
  });

  const displayOutputFrameCount = displayOutputEnd - displayOutputStart;

  // Video hover preview hook
  const hoverPreview = useVideoHoverPreview({
    videoUrl,
    frameRate: effectiveMetadata?.frame_rate || 30,
    enabled: !isDragging && !!effectiveMetadata,
  });

  // Extract frames for thumbnail strip
  const {
    frames: displayFrameImages,
    isExtracting: isExtractingFrames,
    isReady: isVideoReady,
  } = useVideoFrameExtraction(videoUrl, {
    metadata: effectiveMetadata,
    treatment,
    sourceRange: { start: effectiveSourceStart, end: effectiveSourceEnd },
    outputFrameCount,
    skip: !!isDragging,
  });

  // Calculate video coverage for clip mode
  const videoCoversFrames = treatment === 'clip' ? Math.min(sourceFrameCount, outputFrameCount) : outputFrameCount;
  const videoCoverageRatio = outputFrameCount > 0 ? videoCoversFrames / outputFrameCount : 1;

  // Calculate position on timeline
  const stripEffectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
  const clampedDisplayStart = Math.max(fullMin, displayOutputStart);
  const clampedDisplayEnd = Math.min(fullMax, displayOutputEnd);
  const startPixel = fullRange > 0
    ? TIMELINE_PADDING_OFFSET + ((clampedDisplayStart - fullMin) / fullRange) * stripEffectiveWidth
    : TIMELINE_PADDING_OFFSET;
  const endPixel = fullRange > 0
    ? TIMELINE_PADDING_OFFSET + ((clampedDisplayEnd - fullMin) / fullRange) * stripEffectiveWidth
    : TIMELINE_PADDING_OFFSET + stripEffectiveWidth;
  const widthPixel = Math.max(0, endPixel - startPixel);

  const stripLeftPercent = (startPixel / containerWidth) * 100;
  const stripWidthPercent = (widthPixel / containerWidth) * 100;

  // Legacy positioning
  const legacyPositionPercent = fullRange > 0 ? ((displayOutputStart - fullMin) / fullRange) * 100 : 0;
  const legacyWidthPercent = fullRange > 0 ? (displayOutputFrameCount / fullRange) * 100 : 100;

  // Click outside handlers using the hook
  const enableTapToSelect = isTablet && !readOnly && onRangeChange;

  // Desktop: click outside to deactivate strip
  useClickOutside(
    () => {
      setIsStripActive(false);
      setSelectedEndpoint(null);
    },
    { enabled: isStripActive && !isTablet, delay: 0 },
    outerContainerRef as React.RefObject<HTMLDivElement>
  );

  // iPad: touch outside to deselect endpoint
  useClickOutside(
    () => setSelectedEndpoint(null),
    { events: ['touchstart'], enabled: !!selectedEndpoint && !!enableTapToSelect, delay: 100 },
    outerContainerRef as React.RefObject<HTMLDivElement>
  );

  // Handle mouse move for hover preview
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) return;
    if (!isVideoReady) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;

    // Calculate timeline frame
    const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
    const normalizedX = Math.max(0, Math.min(1, (cursorX - TIMELINE_PADDING_OFFSET) / effectiveWidth));
    const timelineFrame = Math.round(fullMin + (normalizedX * (fullMax - fullMin)));
    setCurrentTimelineFrame(timelineFrame);

    // Calculate video frame
    const videoFrame = treatment === 'adjust'
      ? calculateAdjustModeFrame(cursorX, containerWidth, fullMin, fullMax, effectiveMetadata)
      : calculateClipModeFrame(cursorX, containerWidth, fullMin, fullMax, effectiveMetadata);

    hoverPreview.updateHoverPosition(e.clientX, e.clientY - 140, videoFrame);
  }, [treatment, containerWidth, fullMin, fullMax, effectiveMetadata, hoverPreview.updateHoverPosition, isDragging, isVideoReady]);

  // Desktop: click on strip to toggle handles visibility
  const handleStripClick = useCallback((e: React.MouseEvent) => {
    if (isTablet) return;
    if ((e.target as HTMLElement).closest('button, select, [role="listbox"], [data-resize-handle]')) return;
    setIsStripActive(prev => !prev);
  }, [isTablet]);

  // ===== TABLET TAP-TO-SELECT ENDPOINT HANDLERS =====
  const handleEndpointTouchStart = useCallback((endpoint: 'left' | 'right', e: React.TouchEvent) => {
    if (!enableTapToSelect) return;
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
  }, [enableTapToSelect]);

  const handleEndpointTouchEnd = useCallback((endpoint: 'left' | 'right', e: React.TouchEvent) => {
    if (!enableTapToSelect || !touchStartPosRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);
    touchStartPosRef.current = null;

    if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) return;

    e.preventDefault();
    e.stopPropagation();
    setSelectedEndpoint(prev => prev === endpoint ? null : endpoint);
  }, [enableTapToSelect]);

  // Handle tap on strip area to place the selected endpoint
  const handleStripTapToPlace = useCallback((e: React.TouchEvent) => {
    if (!enableTapToSelect || !selectedEndpoint || !outerContainerRef.current || !onRangeChange) return;

    const touch = e.changedTouches[0];
    const rect = outerContainerRef.current.getBoundingClientRect();
    const tapX = touch.clientX;

    const MIN_DURATION_FRAMES = 10;
    const EDGE_SNAP_THRESHOLD = 5;

    if (stripWidthPercent < 1) {
      setSelectedEndpoint(null);
      return;
    }

    // Find sibling boundaries
    let leftLimit = Math.max(0, fullMin);
    let rightLimit = Math.min(fullMax, fullMax);
    for (const sibling of siblingRanges) {
      if (sibling.end <= effectiveOutputStart && sibling.end > leftLimit) {
        leftLimit = sibling.end;
      }
      if (sibling.start >= effectiveOutputEnd && sibling.start < rightLimit) {
        rightLimit = sibling.start;
      }
    }

    // Calculate target frame
    const fullTimelineWidth = rect.width / (stripWidthPercent / 100);
    const timelineLeft = rect.left - (stripLeftPercent / 100) * fullTimelineWidth;
    const normalizedX = Math.max(0, Math.min(1, (tapX - timelineLeft) / fullTimelineWidth));
    const targetFrame = Math.round(fullMin + normalizedX * fullRange);

    if (selectedEndpoint === 'left') {
      let newStart: number;
      if (targetFrame <= leftLimit + EDGE_SNAP_THRESHOLD) {
        newStart = leftLimit;
      } else {
        newStart = Math.max(leftLimit, targetFrame);
      }
      newStart = Math.min(newStart, effectiveOutputEnd - MIN_DURATION_FRAMES);
      newStart = Math.max(fullMin, Math.min(newStart, fullMax - MIN_DURATION_FRAMES));
      const finalEnd = Math.min(effectiveOutputEnd, fullMax);
      onRangeChange(newStart, finalEnd);
    } else {
      let newEnd: number;
      if (targetFrame >= rightLimit - EDGE_SNAP_THRESHOLD) {
        newEnd = rightLimit;
      } else {
        newEnd = Math.min(rightLimit, targetFrame);
      }
      newEnd = Math.max(newEnd, effectiveOutputStart + MIN_DURATION_FRAMES);
      newEnd = Math.min(fullMax, Math.max(newEnd, fullMin + MIN_DURATION_FRAMES));
      const finalStart = Math.max(effectiveOutputStart, fullMin);
      onRangeChange(finalStart, newEnd);
    }

    setSelectedEndpoint(null);
  }, [enableTapToSelect, selectedEndpoint, stripLeftPercent, stripWidthPercent, fullMin, fullMax, fullRange, effectiveOutputStart, effectiveOutputEnd, siblingRanges, onRangeChange]);

  // Track touch start for tap detection
  const handleStripTouchStart = useCallback((e: React.TouchEvent) => {
    if (!enableTapToSelect) return;
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };
  }, [enableTapToSelect]);

  const handleStripTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!touchStartPosRef.current) return;

    const touch = e.changedTouches[0];
    const deltaX = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const deltaY = Math.abs(touch.clientY - touchStartPosRef.current.y);
    touchStartPosRef.current = null;

    if (deltaX > SCROLL_THRESHOLD || deltaY > SCROLL_THRESHOLD) return;

    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-resize-handle]')) return;

    // If endpoint selected and strip active, place it
    if (selectedEndpoint && isStripActive && enableTapToSelect) {
      handleStripTapToPlace(e);
      return;
    }

    // Double-tap detection for iPad
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTimeRef.current;
    lastTapTimeRef.current = now;

    if (timeSinceLastTap < DOUBLE_TAP_DELAY && isTablet) {
      e.preventDefault();
      setIsStripActive(prev => !prev);
      tapPreview.hide();
      setSelectedEndpoint(null);
    } else if (isTablet && !isStripActive) {
      // Single tap - show frame preview
      e.preventDefault();

      const rect = stripContainerRef.current?.getBoundingClientRect();
      if (rect && effectiveMetadata) {
        const cursorX = touch.clientX - rect.left;
        const videoFrame = treatment === 'adjust'
          ? calculateAdjustModeFrame(cursorX, containerWidth, fullMin, fullMax, effectiveMetadata)
          : calculateClipModeFrame(cursorX, containerWidth, fullMin, fullMax, effectiveMetadata);

        const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
        const normalizedX = Math.max(0, Math.min(1, (cursorX - TIMELINE_PADDING_OFFSET) / effectiveWidth));
        const timelineFrame = Math.round(fullMin + (normalizedX * (fullMax - fullMin)));

        setCurrentTimelineFrame(timelineFrame);
        hoverPreview.updateHoverPosition(touch.clientX, touch.clientY - 140, videoFrame);
        tapPreview.show();
      }
    }
  }, [enableTapToSelect, selectedEndpoint, handleStripTapToPlace, isTablet, isStripActive, treatment, containerWidth, fullMin, fullMax, effectiveMetadata, hoverPreview.updateHoverPosition, tapPreview.show, tapPreview.hide]);

  // Close hover state when treatment changes
  useEffect(() => {
    hoverPreview.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hoverPreview.reset is stable (useCallback)
  }, [treatment]);

  // Show tap-to-place hint when endpoint is selected
  useEffect(() => {
    if (selectedEndpoint && enableTapToSelect) {
      tapToPlaceHint.show();
    } else {
      tapToPlaceHint.hide();
    }
  }, [selectedEndpoint, enableTapToSelect, tapToPlaceHint]);

  return (
    <div className={useAbsolutePosition ? 'contents' : 'w-full relative'}>
      {/* Floating preview box - rendered via portal */}
      {createPortal(
        <div
          className="fixed pointer-events-none"
          style={{
            left: `${hoverPreview.hoverPosition.x}px`,
            top: `${hoverPreview.hoverPosition.y}px`,
            transform: 'translateX(-50%)',
            zIndex: 999999,
            display: (hoverPreview.isHovering || tapPreview.isVisible) && isVideoReady && !isDragging ? 'block' : 'none'
          }}
        >
          <div className="bg-background border-2 border-primary rounded-lg shadow-2xl overflow-hidden">
            <canvas
              ref={hoverPreview.canvasRef}
              className="w-32 h-auto block"
              style={{ imageRendering: 'auto' }}
            />
            <div className="px-2 py-1 bg-background/95 border-t border-primary/40">
              <span className="text-[10px] font-medium text-foreground">
                Frame {currentTimelineFrame}
              </span>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Structure video strip - outer container */}
      <div
        ref={outerContainerRef}
        className={`${useAbsolutePosition ? 'absolute' : 'relative'} h-20 ${useAbsolutePosition ? '' : '-mt-1 mb-3'} group ${isDragging ? 'select-none' : ''}`}
        data-tour="structure-video"
        style={{
          ...(useAbsolutePosition ? {
            left: `${stripLeftPercent}%`,
            width: `${stripWidthPercent}%`,
            top: 0,
            bottom: 0,
          } : {
            width: outputStartFrame !== undefined
              ? `${legacyWidthPercent * (zoomLevel > 1 ? zoomLevel : 1)}%`
              : (zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%'),
            marginLeft: outputStartFrame !== undefined
              ? `${legacyPositionPercent}%`
              : 0,
            minWidth: outputStartFrame !== undefined ? 0 : '100%',
            paddingLeft: `${TIMELINE_HORIZONTAL_PADDING}px`,
            paddingRight: `${TIMELINE_HORIZONTAL_PADDING}px`,
          }),
          overflow: 'visible',
          cursor: isDragging === 'move' ? 'grabbing' : undefined,
        }}
      >
        {/* Full-width tap overlay when endpoint is selected */}
        {selectedEndpoint && enableTapToSelect && useAbsolutePosition && isStripActive && (
          <div
            className="absolute top-0 bottom-0 z-20 cursor-crosshair"
            style={{
              left: `${(-stripLeftPercent / stripWidthPercent) * 100}%`,
              right: `${(-(100 - stripLeftPercent - stripWidthPercent) / stripWidthPercent) * 100}%`,
            }}
            onTouchStart={handleStripTouchStart}
            onTouchEnd={handleStripTouchEnd}
          />
        )}

        {/* Resize handles */}
        {!readOnly && onRangeChange && (
          <>
            <TimelineResizeHandle
              side="left"
              isActive={isStripActive || selectedEndpoint === 'left'}
              isSelected={selectedEndpoint === 'left'}
              showHint={!!enableTapToSelect && tapToPlaceHint.isVisible}
              margin={useAbsolutePosition ? '0px' : `${TIMELINE_HORIZONTAL_PADDING}px`}
              onMouseDown={(e) => handleDragStart('left', e)}
              onTouchStart={(e) => handleEndpointTouchStart('left', e)}
              onTouchEnd={(e) => handleEndpointTouchEnd('left', e)}
            />
            <TimelineResizeHandle
              side="right"
              isActive={isStripActive || selectedEndpoint === 'right'}
              isSelected={selectedEndpoint === 'right'}
              showHint={!!enableTapToSelect && tapToPlaceHint.isVisible}
              margin={useAbsolutePosition ? '0px' : `${TIMELINE_HORIZONTAL_PADDING}px`}
              onMouseDown={(e) => handleDragStart('right', e)}
              onTouchStart={(e) => handleEndpointTouchStart('right', e)}
              onTouchEnd={(e) => handleEndpointTouchEnd('right', e)}
            />
          </>
        )}

        {/* Inner container for video content */}
        <div
          ref={stripContainerRef}
          className="absolute left-0 top-0 bottom-0"
          style={{
            width: treatment === 'clip' && sourceFrameCount < outputFrameCount
              ? `${videoCoverageRatio * 100}%`
              : '100%',
            paddingLeft: useAbsolutePosition ? '0px' : `${TIMELINE_HORIZONTAL_PADDING}px`,
            paddingRight: useAbsolutePosition ? '0px' : `${TIMELINE_HORIZONTAL_PADDING}px`,
          }}
          onMouseMove={handleMouseMove}
          onMouseEnter={hoverPreview.handleMouseEnter}
          onMouseLeave={hoverPreview.handleMouseLeave}
        >
          {/* Hidden video element for frame extraction */}
          <video
            ref={hoverPreview.videoRef}
            src={videoUrl}
            preload="auto"
            className="hidden"
            crossOrigin="anonymous"
            muted
            playsInline
          />

          {/* Delete button */}
          {!readOnly && (
            <Button
              variant="destructive"
              size="sm"
              className="absolute top-1 right-3 z-30 h-6 w-6 p-0 opacity-90 hover:opacity-100 shadow-lg rounded-full"
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onRemove();
              }}
              title="Remove guidance video"
            >
              <X className="h-4 w-4" />
            </Button>
          )}

          {/* Frame strip */}
          {displayFrameImages.length > 0 ? (
            <div
              className={`absolute top-5 bottom-1 flex border-2 rounded overflow-hidden shadow-md ${
                isDragging === 'move' ? 'border-primary cursor-grabbing' : isStripActive ? 'border-primary cursor-grab' : 'border-primary/40 cursor-pointer'
              } ${!readOnly && onRangeChange && !isStripActive ? 'hover:border-primary/60' : ''} ${selectedEndpoint ? 'cursor-crosshair' : ''}`}
              style={{
                left: useAbsolutePosition ? '2px' : '16px',
                right: useAbsolutePosition ? '2px' : '16px',
              }}
              onClick={handleStripClick}
              onMouseDown={(e) => {
                if ((e.target as HTMLElement).closest('button, select, [role="listbox"]')) return;
                if (!isStripActive) return;
                handleDragStart('move', e);
              }}
              onTouchStart={handleStripTouchStart}
              onTouchEnd={handleStripTouchEnd}
            >
              {/* Loading overlay */}
              {isExtractingFrames && !isDragging && videoCoverageRatio > 0.3 && (
                <div className="absolute inset-0 flex items-center justify-center bg-background/20 backdrop-blur-sm z-10">
                  <span className="text-xs font-medium text-foreground bg-background/90 px-3 py-1.5 rounded-md border shadow-sm">
                    Loading updated timeline...
                  </span>
                </div>
              )}

              {/* Frame images */}
              {displayFrameImages.map((frameUrl, index) => (
                <img
                  key={index}
                  src={frameUrl}
                  alt={`Frame ${index}`}
                  className="h-full object-cover flex-1 border-l border-r border-border/20"
                  style={{ minWidth: 0 }}
                />
              ))}
            </div>
          ) : (
            <div
              className={`absolute top-5 bottom-1 flex items-center justify-center bg-muted/50 dark:bg-muted-foreground/15 border rounded-sm ${
                !readOnly && onRangeChange ? (isStripActive ? 'cursor-grab border-primary/50' : 'cursor-pointer hover:border-primary/40') : 'border-border/30'
              } ${selectedEndpoint ? 'cursor-crosshair' : ''}`}
              style={{
                left: useAbsolutePosition ? '2px' : '16px',
                right: useAbsolutePosition ? '2px' : '16px',
              }}
              onClick={handleStripClick}
              onMouseDown={(e) => {
                if (!isStripActive) return;
                handleDragStart('move', e);
              }}
              onTouchStart={handleStripTouchStart}
              onTouchEnd={handleStripTouchEnd}
            >
              <span className="text-xs text-muted-foreground font-medium">
                {isVideoReady ? 'Loading frames...' : 'Loading video...'}
              </span>
            </div>
          )}
        </div>

        {/* Frame range indicator */}
        {outputStartFrame !== undefined && !readOnly && (
          <div
            className="absolute bottom-0 z-50 flex justify-between items-center text-[9px] text-muted-foreground font-mono"
            style={{
              left: useAbsolutePosition ? '2px' : '16px',
              right: useAbsolutePosition ? '2px' : '16px',
            }}
          >
            <div className="flex items-center gap-1">
              <span className={`px-1 rounded bg-background/80 pointer-events-none ${isDragging ? 'ring-1 ring-primary' : ''}`}>f{displayOutputStart}</span>
              {/* Treatment selector */}
              <Select value={treatment} onValueChange={(newTreatment: 'adjust' | 'clip') => {
                if (newTreatment === 'clip' && onRangeChange) {
                  const videoFrames = effectiveMetadata?.total_frames || 0;
                  const currentDuration = displayOutputEnd - displayOutputStart;

                  if (videoFrames > 0 && currentDuration > videoFrames) {
                    onRangeChange(displayOutputStart, displayOutputStart + videoFrames);
                  }
                }
                onTreatmentChange(newTreatment);
              }}>
                <SelectTrigger variant="retro" size="sm" className="h-4 w-[72px] text-[8px] px-1 py-0 !bg-background hover:!bg-background font-sans [&>span]:line-clamp-none [&>span]:whitespace-nowrap">
                  <SelectValue>
                    {treatment === 'adjust' ? 'Fit to range' : '1:1 mapping'}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent variant="retro">
                  <SelectItem variant="retro" value="adjust">
                    <div className="flex flex-col gap-0.5 py-1">
                      <span className="text-xs font-medium">Fit to range</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        Stretch or compress video to fill the entire range
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem variant="retro" value="clip">
                    <div className="flex flex-col gap-0.5 py-1">
                      <span className="text-xs font-medium">1:1 mapping</span>
                      <span className="text-[10px] text-muted-foreground leading-tight">
                        Each video frame maps to one output frame
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <span className={`px-1 rounded bg-background/80 pointer-events-none ${isDragging ? 'ring-1 ring-primary' : ''}`}>f{displayOutputEnd}</span>
          </div>
        )}

      </div>
    </div>
  );
};
