import React, { useRef, useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { VideoMetadata } from '@/shared/lib/videoUploader';
import { TIMELINE_HORIZONTAL_PADDING, TIMELINE_PADDING_OFFSET } from './constants';
import { TimelineResizeHandle } from './TimelineResizeHandle';
import { Button } from '@/shared/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/components/ui/select';
import { X } from 'lucide-react';
import { useIsTablet } from '@/shared/hooks/mobile';
import { useTemporaryVisibility } from '../../hooks/useTemporaryVisibility';
import { useVideoMetadata } from '../../hooks/useVideoMetadata';
import { useVideoFrameExtraction } from '@/shared/hooks/useVideoFrameExtraction';
import { useClickOutside } from '../../hooks/useClickOutside';
import { useTimelineStripDrag } from './hooks/useTimelineStripDrag';
import { useTabletEndpointSelection } from './hooks/useTabletEndpointSelection';
import { useVideoHoverPreview } from '@/shared/hooks/useVideoHoverPreview';

/**
 * Calculate the video frame number from a normalized position (0-1) within the strip.
 * Handles both treatment modes:
 * - 'adjust' (fit to range): maps position proportionally across the entire source video
 * - 'clip' (1:1 mapping): maps position to sourceStart + output offset, clamped to source range
 */
function calculateVideoFrameFromPosition(
  normalizedPosition: number,
  treatment: 'adjust' | 'clip',
  totalVideoFrames: number,
  displayOutputFrameCount: number,
  effectiveSourceStart: number,
  effectiveSourceEnd: number,
): number {
  if (treatment === 'adjust') {
    // For "fit to range": sample throughout the entire source video
    const frame = Math.floor(normalizedPosition * (totalVideoFrames - 1));
    return Math.max(0, Math.min(frame, totalVideoFrames - 1));
  } else {
    // For "1:1 mapping": video frame N maps to output frame N
    const outputOffset = Math.floor(normalizedPosition * displayOutputFrameCount);
    const frame = effectiveSourceStart + outputOffset;
    // Clamp to source range (video may be shorter than output range)
    return Math.max(effectiveSourceStart, Math.min(frame, effectiveSourceEnd - 1));
  }
}

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
  readOnly = false,
  outputStartFrame,
  outputEndFrame,
  sourceStartFrame,
  sourceEndFrame,
  onRangeChange,
  useAbsolutePosition = false,
  siblingRanges = [],
}) => {
  // Calculate effective output range
  const effectiveOutputStart = outputStartFrame ?? fullMin;
  const effectiveOutputEnd = outputEndFrame ?? fullMax;
  const outputFrameCount = effectiveOutputEnd - effectiveOutputStart;

  const stripContainerRef = useRef<HTMLDivElement>(null);
  const outerContainerRef = useRef<HTMLDivElement>(null);
  const [currentVideoFrame, setCurrentVideoFrame] = useState(0);

  // Device detection and active state
  const isTablet = useIsTablet();
  const [isStripActive, setIsStripActive] = useState(false);

  // Temporary visibility for tap frame preview
  const tapPreview = useTemporaryVisibility(2000);

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
  const { updateHoverPosition, reset: resetHoverPreview } = hoverPreview;

  // Extract frames for thumbnail strip
  const {
    frames: displayFrameImages,
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

  // Sample one frame per N pixels, evenly distributed from extracted frames
  const PIXELS_PER_FRAME = 20;
  const targetFrameCount = Math.max(1, Math.floor(widthPixel / PIXELS_PER_FRAME));
  const framesToRender = displayFrameImages.length <= targetFrameCount
    ? displayFrameImages
    : targetFrameCount === 1
      ? [displayFrameImages[Math.floor(displayFrameImages.length / 2)]]
      : Array.from({ length: targetFrameCount }, (_, i) =>
          displayFrameImages[Math.round(i * (displayFrameImages.length - 1) / (targetFrameCount - 1))]
        );
  const isCollapsed = targetFrameCount <= 1;

  // Legacy positioning
  const legacyPositionPercent = fullRange > 0 ? ((displayOutputStart - fullMin) / fullRange) * 100 : 0;
  const legacyWidthPercent = fullRange > 0 ? (displayOutputFrameCount / fullRange) * 100 : 100;

  const enableTapToSelect = isTablet && !readOnly && onRangeChange;

  // Tablet touch gesture handling (endpoint selection, tap-to-place, double-tap)
  const {
    selectedEndpoint,
    clearSelection,
    tapToPlaceHintVisible,
    handleEndpointTouchStart,
    handleEndpointTouchEnd,
    handleStripTouchStart,
    handleStripTouchEnd,
  } = useTabletEndpointSelection({
    enabled: !!enableTapToSelect,
    isStripActive,
    isTablet,
    stripLeftPercent,
    stripWidthPercent,
    fullMin,
    fullMax,
    fullRange,
    effectiveOutputStart,
    effectiveOutputEnd,
    siblingRanges,
    outerContainerRef,
    onRangeChange,
    onDoubleTap: useCallback(() => {
      setIsStripActive(prev => !prev);
      tapPreview.hide();
    }, [tapPreview]),
    onSingleTap: useCallback((touch: Touch) => {
      const rect = stripContainerRef.current?.getBoundingClientRect();
      if (rect && effectiveMetadata) {
        const cursorX = touch.clientX - rect.left;
        const stripWidth = rect.width;
        const normalizedPosition = Math.max(0, Math.min(1, cursorX / stripWidth));

        const videoFrame = calculateVideoFrameFromPosition(
          normalizedPosition, treatment, effectiveMetadata.total_frames,
          displayOutputFrameCount, effectiveSourceStart, effectiveSourceEnd,
        );

        setCurrentVideoFrame(videoFrame);
        updateHoverPosition(touch.clientX, touch.clientY - 140, videoFrame);
        tapPreview.show();
      }
    }, [treatment, effectiveMetadata, displayOutputFrameCount, effectiveSourceStart, effectiveSourceEnd, updateHoverPosition, tapPreview]),
  });

  // Desktop: click outside to deactivate strip
  useClickOutside(
    () => {
      setIsStripActive(false);
      clearSelection();
    },
    { enabled: isStripActive && !isTablet, delay: 0 },
    outerContainerRef as React.RefObject<HTMLDivElement>
  );

  // Handle mouse move for hover preview
  const mouseMoveCountRef = useRef(0);
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) return;
    if (!effectiveMetadata) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const stripWidth = rect.width;

    // Normalize cursor position within the strip (0 to 1)
    const normalizedPosition = Math.max(0, Math.min(1, cursorX / stripWidth));

    const videoFrame = calculateVideoFrameFromPosition(
      normalizedPosition, treatment, effectiveMetadata.total_frames,
      displayOutputFrameCount, effectiveSourceStart, effectiveSourceEnd,
    );

    // Log first few moves to trace the flow
    mouseMoveCountRef.current++;

    setCurrentVideoFrame(videoFrame);
    updateHoverPosition(e.clientX, e.clientY - 140, videoFrame);
  }, [treatment, effectiveMetadata, displayOutputFrameCount, effectiveSourceStart, effectiveSourceEnd, updateHoverPosition, isDragging]);

  // Desktop: click on strip to toggle handles visibility
  const handleStripClick = useCallback((e: React.MouseEvent) => {
    if (isTablet) return;
    if ((e.target as HTMLElement).closest('button, select, [role="listbox"], [data-resize-handle]')) return;
    setIsStripActive(prev => !prev);
  }, [isTablet]);

  // Close hover state when treatment changes
  useEffect(() => {
    resetHoverPreview();
     
  }, [treatment, resetHoverPreview]);

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
            display: (hoverPreview.isHovering || tapPreview.isVisible) && hoverPreview.isVideoReady && !isDragging ? 'block' : 'none'
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
                Frame {currentVideoFrame}
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
              showHint={!!enableTapToSelect && tapToPlaceHintVisible}
              margin={useAbsolutePosition ? '0px' : `${TIMELINE_HORIZONTAL_PADDING}px`}
              onMouseDown={(e) => handleDragStart('left', e)}
              onTouchStart={(e) => handleEndpointTouchStart('left', e)}
              onTouchEnd={(e) => handleEndpointTouchEnd('left', e)}
            />
            <TimelineResizeHandle
              side="right"
              isActive={isStripActive || selectedEndpoint === 'right'}
              isSelected={selectedEndpoint === 'right'}
              showHint={!!enableTapToSelect && tapToPlaceHintVisible}
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

          {/* Delete button - hidden when collapsed */}
          {!readOnly && !isCollapsed && (
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
          {framesToRender.length > 0 ? (
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
              {framesToRender.map((frameUrl, index) => (
                <img
                  key={index}
                  src={frameUrl}
                  alt={`Frame ${index}`}
                  className="h-full object-cover flex-1"
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
                {displayFrameImages.length > 0 ? 'Loading frames...' : 'Loading video...'}
              </span>
            </div>
          )}
        </div>

        {/* Frame range indicator - hidden when collapsed */}
        {outputStartFrame !== undefined && !readOnly && !isCollapsed && (
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
