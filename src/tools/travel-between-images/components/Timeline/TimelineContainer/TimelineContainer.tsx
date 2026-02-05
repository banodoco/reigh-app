import React, { useCallback, useRef, useEffect, useLayoutEffect } from 'react';
import { TIMELINE_HORIZONTAL_PADDING, TIMELINE_PADDING_OFFSET } from '../constants';

// Timeline sub-components (existing)
import TimelineRuler from '../TimelineRuler';
import DropIndicator from '../DropIndicator';
import PairRegion from '../PairRegion';
import TimelineItem from '../TimelineItem';
import TrailingEndpoint from '../TrailingEndpoint';
import { TRAILING_ENDPOINT_KEY } from '../utils/timeline-utils';
import { GuidanceVideoStrip } from '../GuidanceVideoStrip';
import { GuidanceVideoUploader } from '../GuidanceVideoUploader';
import { GuidanceVideosContainer } from '../GuidanceVideosContainer';
import { AudioStrip } from '../AudioStrip';
import { SegmentOutputStrip } from '../SegmentOutputStrip';
import { DatasetBrowserModal } from '@/shared/components/DatasetBrowserModal';
import { usePendingSegmentTasks } from '@/shared/hooks/usePendingSegmentTasks';
import { SelectionActionBar } from '@/shared/components/ShotImageManager/components/SelectionActionBar';

// Extracted sub-components
import {
  TimelineSkeletonItem,
  ZoomControls,
  GuidanceVideoControls,
  TimelineBottomControls,
  PendingFrameMarker,
  AddAudioButton,
} from './components';

// Orchestrator hook
import { useTimelineOrchestrator } from '../hooks/useTimelineOrchestrator';
import { findTrailingVideoInfo } from '../utils/timeline-utils';

// Types
import type { TimelineContainerProps } from './types';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';

const TimelineContainer: React.FC<TimelineContainerProps> = ({
  shotId,
  projectId,
  images,
  isUploadingImage = false,
  uploadProgress = 0,
  framePositions,
  setFramePositions,
  onImageReorder,
  onFileDrop,
  onGenerationDrop,
  setIsDragInProgress,
  onResetFrames,
  onPairClick,
  pairPrompts,
  enhancedPrompts,
  defaultPrompt,
  defaultNegativePrompt,
  onClearEnhancedPrompt,
  onImageDelete,
  onImageDuplicate,
  readOnly = false,
  duplicatingImageId,
  duplicateSuccessImageId,
  projectAspectRatio,
  handleDesktopDoubleClick,
  handleMobileTap,
  handleInpaintClick,
  structureVideoPath,
  structureVideoMetadata,
  structureVideoTreatment = 'adjust',
  structureVideoMotionStrength = 1.0,
  structureVideoType = 'flow',
  onStructureVideoChange,
  uni3cEndPercent = 0.1,
  onUni3cEndPercentChange,
  structureVideos,
  onAddStructureVideo,
  onUpdateStructureVideo,
  onRemoveStructureVideo,
  audioUrl,
  audioMetadata,
  onAudioChange,
  hasNoImages = false,
  maxFrameLimit = 81,
  selectedOutputId,
  onSelectedOutputChange,
  onSegmentFrameCountChange,
  videoOutputs,
  onNewShotFromSelection,
  onShotChange,
  onRegisterTrailingUpdater,
}) => {
  // Derive trailingEndFrame from positions map (single source of truth)
  const trailingEndFrame = framePositions.get(TRAILING_ENDPOINT_KEY);

  // Helper: update trailing endpoint in positions
  const handleTrailingEndFrameChange = React.useCallback((endFrame: number | undefined) => {
    const next = new Map(framePositions);
    if (endFrame === undefined) {
      next.delete(TRAILING_ENDPOINT_KEY);
    } else {
      next.set(TRAILING_ENDPOINT_KEY, endFrame);
    }
    setFramePositions(next);
  }, [framePositions, setFramePositions]);

  // Register trailing end frame updater with parent (for useFrameCountUpdater to use).
  // Uses useLayoutEffect to ensure the ref is set before any user interactions fire.
  useLayoutEffect(() => {
    onRegisterTrailingUpdater?.(handleTrailingEndFrameChange);
  }, [onRegisterTrailingUpdater, handleTrailingEndFrameChange]);

  // Compute trailing video info from videoOutputs SYNCHRONOUSLY to avoid layout shift
  // This replaces the async callback approach that caused fullMax to expand after render
  const { hasTrailing: hasExistingTrailingVideo, videoUrl: computedTrailingVideoUrl } = React.useMemo(() => {
    if (!videoOutputs || videoOutputs.length === 0 || images.length === 0) {
      return { hasTrailing: false, videoUrl: null };
    }

    // Find the last image's shot_generation_id from framePositions (exclude trailing key)
    const sortedEntries = [...framePositions.entries()]
      .filter(([id]) => id !== TRAILING_ENDPOINT_KEY)
      .sort((a, b) => a[1] - b[1]);
    const lastImageShotGenId = sortedEntries[sortedEntries.length - 1]?.[0] || null;

    return findTrailingVideoInfo(videoOutputs, lastImageShotGenId);
  }, [videoOutputs, framePositions, images.length]);

  // Use computed URL, with callback as fallback for edge cases
  const [callbackTrailingVideoUrl, setTrailingVideoUrl] = React.useState<string | null>(null);
  const trailingVideoUrl = computedTrailingVideoUrl || callbackTrailingVideoUrl;

  // Use orchestrator hook for all state, effects, and handlers
  const {
    timelineRef,
    containerRef,
    fullMin,
    fullMax,
    fullRange,
    containerWidth,
    dragState,
    dragOffset,
    currentDragFrame,
    swapTargetId,
    dragDistances,
    handleMouseDown,
    zoomLevel,
    handleZoomInToCenter,
    handleZoomOutFromCenter,
    handleZoomReset,
    handleZoomToStart,
    handleTimelineDoubleClick,
    selectedIds,
    showSelectionBar,
    isSelected,
    toggleSelection,
    clearSelection,
    pendingDropFrame,
    pendingDuplicateFrame,
    pendingExternalAddFrame,
    activePendingFrame,
    isInternalDropProcessing,
    isFileOver,
    dropTargetFrame,
    dragType,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    currentPositions,
    pairInfo,
    pairDataByIndex,
    localShotGenPositions,
    showPairLabels,
    handleDuplicateInterceptor,
    handleTimelineTapToMove,
    handleVideoBrowserSelect,
    handleEndpointMouseDown,
    endpointDragFrame,
    isEndpointDragging: isEndpointDraggingState,
    resetGap,
    setResetGap,
    maxGap,
    showVideoBrowser,
    setShowVideoBrowser,
    isUploadingStructureVideo,
    setIsUploadingStructureVideo,
    isMobile,
    isTablet,
    enableTapToMove,
    prefetchTaskData,
  } = useTimelineOrchestrator({
    shotId,
    projectId,
    images,
    framePositions,
    setFramePositions,
    onImageReorder,
    onFileDrop,
    onGenerationDrop,
    setIsDragInProgress,
    onImageDuplicate,
    readOnly,
    isUploadingImage,
    maxFrameLimit,
    structureVideos,
    structureVideoType,
    structureVideoTreatment,
    structureVideoMotionStrength,
    onAddStructureVideo,
    onUpdateStructureVideo,
    onStructureVideoChange,
    hasExistingTrailingVideo,
  });

  // Image-only positions (excluding trailing endpoint) for sorts that need the "last image"
  const imagePositions = React.useMemo(() => {
    const filtered = new Map(currentPositions);
    filtered.delete(TRAILING_ENDPOINT_KEY);
    return filtered;
  }, [currentPositions]);

  const numPairs = Math.max(0, images.length - 1);
  const maxAllowedGap = 81;

  // Track the last image ID to detect when it changes (new image added at end)
  // When the last image changes, clear trailingVideoUrl to prevent showing stale video
  // Note: trailingEndFrame is handled by derivedEndFrame validation (end_frame > lastImageFrame)
  const lastImageIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (imagePositions.size === 0) return;

    // Find the current last image (highest frame position)
    const sortedEntries = [...imagePositions.entries()].sort((a, b) => a[1] - b[1]);
    const currentLastImageId = sortedEntries[sortedEntries.length - 1]?.[0] || null;

    // If the last image changed, clear trailing video URL
    if (lastImageIdRef.current !== null &&
        currentLastImageId !== lastImageIdRef.current) {
      console.log('[TrailingDebug] Last image changed:', {
        from: lastImageIdRef.current?.substring(0, 8),
        to: currentLastImageId?.substring(0, 8),
      });
      if (trailingVideoUrl) {
        setTrailingVideoUrl(null);
      }
    }

    lastImageIdRef.current = currentLastImageId;
  }, [imagePositions, trailingVideoUrl]);

  // Check for pending segment tasks (needed to show trailing slot when pending)
  const { hasPendingTask } = usePendingSegmentTasks(shotId, projectId);

  // Handler to extract final frame from trailing video and add as next image
  const handleExtractFinalFrame = useCallback(async () => {
    if (!trailingVideoUrl || !onFileDrop) return;

    try {
      // Create video element to extract frame
      const video = document.createElement('video');
      video.crossOrigin = 'anonymous';
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.src = trailingVideoUrl;

      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video'));
        setTimeout(() => reject(new Error('Video load timeout')), 10000);
      });

      // Seek to the last frame (duration - small epsilon)
      video.currentTime = Math.max(0, video.duration - 0.01);

      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        setTimeout(resolve, 2000);
      });

      // Extract frame to canvas
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to get canvas context');

      ctx.drawImage(video, 0, 0);

      // Convert to blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Failed to create blob'))),
          'image/png',
          1.0
        );
      });

      // Create File object
      const file = new File([blob], `extracted-frame-${Date.now()}.png`, { type: 'image/png' });

      // Calculate target frame (after the trailing endpoint)
      const sortedPositions = [...currentPositions.values()].sort((a, b) => a - b);
      const lastImageFrame = sortedPositions[sortedPositions.length - 1] ?? 0;
      const effectiveEndFrame = trailingEndFrame ?? (lastImageFrame + 17);
      const targetFrame = effectiveEndFrame + 5; // Add small gap after endpoint

      // Drop the file at the target position
      await onFileDrop([file], targetFrame);

      // Note: The trailing segment state will be automatically cleared by the useEffect
      // that watches for last image changes

      // Clean up
      video.src = '';
    } catch (error) {
      console.error('[ExtractFinalFrame] Error:', error);
    }
  }, [trailingVideoUrl, onFileDrop, currentPositions, trailingEndFrame]);

  const handleReset = useCallback(() => {
    if (images.length === 1) {
      // Single-image: combine image reset + trailing in one position update.
      // Calling onResetFrames then handleTrailingEndFrameChange would trigger two
      // parallel setFramePositions calls that race on metadata.end_frame.
      const newPositions = new Map<string, number>();
      newPositions.set(images[0].id, 0);
      newPositions.set(TRAILING_ENDPOINT_KEY, resetGap);
      setFramePositions(newPositions);
    } else {
      onResetFrames(resetGap);
    }
  }, [onResetFrames, resetGap, images, setFramePositions]);

  // Build pair click handler for SegmentOutputStrip
  const handleOpenPairSettings = useCallback((pairIndex: number, passedFrameData?: { frames: number; startFrame: number; endFrame: number }) => {
    console.log('[TrailingGen] handleOpenPairSettings called:', {
      pairIndex,
      hasOnPairClick: !!onPairClick,
      imagesLength: images.length,
      trailingEndFrame,
      pairInfoLength: pairInfo.length,
      passedFrameData,
    });

    if (!onPairClick) return;

    // Handle single-image mode (trailing segment is the only segment)
    if (images.length === 1 && trailingEndFrame !== undefined) {
      const entry = [...imagePositions.entries()][0];
      if (entry) {
        const [imageId, imageFrame] = entry;
        const image = images[0];
        const frames = passedFrameData?.frames ?? (trailingEndFrame - imageFrame);
        const startFrame = passedFrameData?.startFrame ?? imageFrame;
        const endFrame = passedFrameData?.endFrame ?? trailingEndFrame;
        onPairClick(pairIndex, {
          index: 0,
          frames,
          startFrame,
          endFrame,
          startImage: {
            id: imageId,
            generationId: image.generation_id,
            url: image.imageUrl || image.thumbUrl,
            thumbUrl: image.thumbUrl,
            position: 1,
          },
          endImage: null,
        });
      }
      return;
    }

    // Handle multi-image trailing segment (pairIndex is after all regular pairs)
    if (pairIndex === pairInfo.length && trailingEndFrame !== undefined && imagePositions.size > 0) {
      console.log('[TrailingGen] Multi-image trailing segment detected');
      const sortedEntries = [...imagePositions.entries()].sort((a, b) => a[1] - b[1]);
      const lastEntry = sortedEntries[sortedEntries.length - 1];
      if (lastEntry) {
        const [imageId, imageFrame] = lastEntry;
        const lastImage = images.find(img => {
          const imgId = img.shot_generation_id || img.id;
          return imgId === imageId;
        }) || images[images.length - 1];

        const defaultOffset = 9; // Same as multi-image default
        const effectiveEndFrame = trailingEndFrame ?? (imageFrame + defaultOffset);
        const frames = passedFrameData?.frames ?? (effectiveEndFrame - imageFrame);
        const startFrame = passedFrameData?.startFrame ?? imageFrame;
        const endFrame = passedFrameData?.endFrame ?? effectiveEndFrame;

        const pairData = {
          index: pairIndex,
          frames,
          startFrame,
          endFrame,
          startImage: lastImage ? {
            id: imageId,
            generationId: lastImage.generation_id,
            url: lastImage.imageUrl || lastImage.thumbUrl,
            thumbUrl: lastImage.thumbUrl,
            position: sortedEntries.length,
          } : null,
          endImage: null,
        };
        console.log('[TrailingGen] Calling onPairClick with:', {
          pairIndex,
          frames: pairData.frames,
          hasStartImage: !!pairData.startImage,
          hasEndImage: !!pairData.endImage,
        });
        onPairClick(pairIndex, pairData);
      }
      return;
    }

    const pairData = pairDataByIndex.get(pairIndex);
    const frameData = passedFrameData ?? pairInfo[pairIndex];
    if (frameData) {
      const mergedPairData = {
        index: pairIndex,
        frames: frameData.frames,
        startFrame: frameData.startFrame,
        endFrame: frameData.endFrame,
        startImage: pairData?.startImage ?? null,
        endImage: pairData?.endImage ?? null,
      };
      onPairClick(pairIndex, mergedPairData);
    } else if (pairData) {
      onPairClick(pairIndex, pairData);
    }
  }, [onPairClick, images, trailingEndFrame, currentPositions, pairDataByIndex, pairInfo]);

  // Memoized callbacks for SelectionActionBar
  const handleDeleteSelected = useCallback(() => {
    selectedIds.forEach(id => onImageDelete(id));
    clearSelection();
  }, [selectedIds, onImageDelete, clearSelection]);

  const handleNewShotFromSelection = useCallback(async () => {
    if (!onNewShotFromSelection) return;
    const newShotId = await onNewShotFromSelection(selectedIds);
    return newShotId;
  }, [onNewShotFromSelection, selectedIds]);

  return (
    <div className="w-full overflow-x-hidden relative">
      <div className="relative">
        {/* Top controls overlay */}
        {shotId && (projectId || readOnly) && onStructureVideoChange && (structureVideoPath || !readOnly) && (
          <div
            className="absolute left-0 z-30 flex items-end justify-between pointer-events-none px-8"
            style={{ width: "100%", maxWidth: "100vw", top: zoomLevel > 1 ? '0.98875rem' : '1rem' }}
          >
            <ZoomControls
              zoomLevel={zoomLevel}
              onZoomIn={handleZoomInToCenter}
              onZoomOut={handleZoomOutFromCenter}
              onZoomReset={handleZoomReset}
              onZoomToStart={handleZoomToStart}
              hasNoImages={hasNoImages}
            />

            {!audioUrl && onAudioChange && !readOnly && (
              <AddAudioButton projectId={projectId} shotId={shotId} onAudioChange={onAudioChange} />
            )}

            {(structureVideos ? true : !structureVideoPath) && (
              <GuidanceVideoControls
                shotId={shotId}
                projectId={projectId}
                readOnly={readOnly}
                hasNoImages={hasNoImages}
                structureVideoType={structureVideoType}
                structureVideoTreatment={structureVideoTreatment}
                structureVideoMotionStrength={structureVideoMotionStrength}
                structureVideos={structureVideos}
                fullMax={fullMax}
                onAddStructureVideo={onAddStructureVideo}
                onUpdateStructureVideo={onUpdateStructureVideo}
                onStructureVideoChange={onStructureVideoChange}
                onShowVideoBrowser={() => setShowVideoBrowser(true)}
                isUploadingStructureVideo={isUploadingStructureVideo}
                setIsUploadingStructureVideo={setIsUploadingStructureVideo}
              />
            )}
          </div>
        )}

        {/* Timeline scrolling container */}
        <div
          ref={timelineRef}
          className={`timeline-scroll relative bg-muted/20 border rounded-lg px-5 overflow-x-auto ${zoomLevel <= 1 ? 'no-scrollbar' : ''} ${isFileOver ? 'ring-2 ring-primary bg-primary/5' : ''}`}
          style={{ minHeight: "240px", paddingTop: "2.5rem", paddingBottom: "7.5rem" }}
          onDragEnter={handleDragEnter}
          onDragOver={(e) => handleDragOver(e, containerRef)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, containerRef)}
        >
          {/* Segment output strip */}
          {shotId && (projectId || (readOnly && videoOutputs)) && (() => {
            // Compute trailing segment info for SegmentOutputStrip
            const sortedEntries = imagePositions.size > 0
              ? [...imagePositions.entries()].sort((a, b) => a[1] - b[1])
              : [];
            const lastEntry = sortedEntries[sortedEntries.length - 1];
            const isMultiImage = images.length > 1;
            const lastImageFrame = lastEntry ? lastEntry[1] : undefined;

            return (
              <SegmentOutputStrip
                shotId={shotId}
                projectId={projectId}
                preloadedGenerations={videoOutputs}
                readOnly={readOnly}
                projectAspectRatio={projectAspectRatio}
                pairInfo={pairInfo}
                fullMin={fullMin}
                fullMax={fullMax}
                fullRange={fullRange}
                containerWidth={containerWidth}
                zoomLevel={zoomLevel}
                localShotGenPositions={localShotGenPositions}
                pairDataByIndex={pairDataByIndex}
                onOpenPairSettings={onPairClick ? handleOpenPairSettings : undefined}
                selectedParentId={selectedOutputId}
                onSelectedParentChange={onSelectedOutputChange}
                onSegmentFrameCountChange={onSegmentFrameCountChange}
                // SIMPLIFIED: Always pass lastImageId so hook can find existing trailing videos
                lastImageId={lastEntry?.[0]}
                // SIMPLIFIED: Only pass trailingSegmentMode when user has configured trailing
                // (trailingEndFrame is set and valid - validation happens in derivedEndFrame)
                trailingSegmentMode={lastEntry && trailingEndFrame !== undefined ? (() => {
                  const [imageId, imageFrame] = lastEntry;
                  console.log('[TrailingDebug] trailingSegmentMode SET:', {
                    imageId: imageId?.substring(0, 8),
                    imageFrame,
                    endFrame: trailingEndFrame,
                  });
                  return { imageId, imageFrame, endFrame: trailingEndFrame };
                })() : undefined}
                isMultiImage={isMultiImage}
                lastImageFrame={lastImageFrame}
                onAddTrailingSegment={lastImageFrame !== undefined && lastEntry ? () => {
                  // Initialize trailing segment with default 17-frame duration
                  handleTrailingEndFrameChange(lastImageFrame + 17);
                } : undefined}
                onRemoveTrailingSegment={isMultiImage && trailingEndFrame !== undefined ? () => {
                  // Remove trailing segment by clearing the end frame
                  handleTrailingEndFrameChange(undefined);
                } : undefined}
                onTrailingVideoInfo={setTrailingVideoUrl}
              />
            );
          })()}

          {/* Structure video strip(s) */}
          {shotId && (projectId || readOnly) && (
            structureVideos && onUpdateStructureVideo && onRemoveStructureVideo ? (
              <GuidanceVideosContainer
                structureVideos={structureVideos}
                onUpdateVideo={onUpdateStructureVideo}
                onRemoveVideo={onRemoveStructureVideo}
                fullMin={fullMin}
                fullMax={fullMax}
                fullRange={fullRange}
                containerWidth={containerWidth}
                zoomLevel={zoomLevel}
                timelineFrameCount={images.length}
                readOnly={readOnly}
              />
            ) : onStructureVideoChange && (
              structureVideoPath ? (
                <GuidanceVideoStrip
                  videoUrl={structureVideoPath}
                  videoMetadata={structureVideoMetadata || null}
                  treatment={structureVideoTreatment}
                  onTreatmentChange={(treatment) => onStructureVideoChange(structureVideoPath, structureVideoMetadata, treatment, structureVideoMotionStrength, structureVideoType)}
                  onRemove={() => onStructureVideoChange(null, null, 'adjust', 1.0, 'flow')}
                  onMetadataExtracted={(metadata) => onStructureVideoChange(structureVideoPath, metadata, structureVideoTreatment, structureVideoMotionStrength, structureVideoType)}
                  fullMin={fullMin}
                  fullMax={fullMax}
                  fullRange={fullRange}
                  containerWidth={containerWidth}
                  zoomLevel={zoomLevel}
                  timelineFrameCount={images.length}
                  readOnly={readOnly}
                />
              ) : isUploadingStructureVideo ? (
                <div className="relative h-28 -mt-1 mb-3" style={{ width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%', minWidth: '100%' }}>
                  <div className="absolute left-4 right-4 top-6 bottom-2 flex items-center justify-center bg-muted/50 dark:bg-muted-foreground/15 border border-border/30 rounded-sm">
                    <span className="text-xs text-muted-foreground font-medium">Uploading video...</span>
                  </div>
                </div>
              ) : !readOnly ? (
                <GuidanceVideoUploader
                  shotId={shotId}
                  projectId={projectId}
                  onVideoUploaded={(videoUrl, metadata) => {
                    if (videoUrl && metadata) onStructureVideoChange(videoUrl, metadata, structureVideoTreatment, structureVideoMotionStrength, structureVideoType);
                  }}
                  currentVideoUrl={structureVideoPath}
                  compact={false}
                  zoomLevel={zoomLevel}
                  onZoomIn={handleZoomInToCenter}
                  onZoomOut={handleZoomOutFromCenter}
                  onZoomReset={handleZoomReset}
                  onZoomToStart={handleZoomToStart}
                  hasNoImages={hasNoImages}
                />
              ) : null
            )
          )}

          {/* Audio strip */}
          {onAudioChange && audioUrl && (
            <div className="mt-1 mb-2">
              <AudioStrip
                audioUrl={audioUrl}
                audioMetadata={audioMetadata || null}
                onRemove={() => onAudioChange(null, null)}
                fullMin={fullMin}
                fullMax={fullMax}
                fullRange={fullRange}
                containerWidth={containerWidth}
                zoomLevel={zoomLevel}
                readOnly={readOnly}
                compact={!!structureVideoPath}
              />
            </div>
          )}

          {/* Timeline container */}
          <div
            ref={containerRef}
            id="timeline-container"
            className="relative h-36 mt-3 mb-2"
            onDoubleClick={(e) => {
              const target = e.target as HTMLElement;
              if (!target.closest('[data-item-id]') && !target.closest('button')) {
                handleTimelineDoubleClick(e, containerRef);
              }
            }}
            onClick={(e) => {
              const target = e.target as HTMLElement;
              if (!target.closest('[data-item-id]') && !target.closest('button')) {
                if (enableTapToMove && selectedIds.length > 0) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleTimelineTapToMove(e.clientX);
                  return;
                }
                if (selectedIds.length > 0) clearSelection();
              }
            }}
            style={{
              width: zoomLevel > 1 ? `${zoomLevel * 100}%` : '100%',
              minWidth: "100%",
              userSelect: 'none',
              paddingLeft: `${TIMELINE_HORIZONTAL_PADDING}px`,
              paddingRight: `${TIMELINE_HORIZONTAL_PADDING + 60}px`,
              cursor: enableTapToMove && selectedIds.length > 0 ? 'crosshair' : 'default',
            }}
          >
            <DropIndicator
              isVisible={isFileOver}
              dropTargetFrame={dropTargetFrame}
              fullMin={fullMin}
              fullRange={fullRange}
              containerWidth={containerWidth}
              dragType={dragType}
            />

            <TimelineRuler
              fullMin={fullMin}
              fullMax={fullMax}
              fullRange={fullRange}
              zoomLevel={zoomLevel}
              containerWidth={containerWidth}
              hasNoImages={hasNoImages}
            />

            {/* Pair regions */}
            {pairInfo.map((pair, index) => {
              const sortedDynamicPositions = [...imagePositions.entries()].sort((a, b) => a[1] - b[1]);
              const [startEntry, endEntry] = [sortedDynamicPositions[index], sortedDynamicPositions[index + 1]];

              const getPixel = (entry: [string, number] | undefined): number => {
                if (!entry) return 0;
                const [, framePos] = entry;
                const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
                return TIMELINE_PADDING_OFFSET + ((framePos - fullMin) / fullRange) * effectiveWidth;
              };

              const startPixel = getPixel(startEntry);
              const endPixel = getPixel(endEntry);
              const actualStartFrame = startEntry?.[1] ?? pair.startFrame;
              const actualEndFrame = endEntry?.[1] ?? pair.endFrame;
              const actualFrames = actualEndFrame - actualStartFrame;

              const startPercent = (startPixel / containerWidth) * 100;
              const endPercent = (endPixel / containerWidth) * 100;

              const contextStartFrameUnclipped = actualEndFrame;
              const contextStartFrame = Math.max(0, contextStartFrameUnclipped);
              const visibleContextFrames = Math.max(0, actualEndFrame - contextStartFrame);

              const effectiveWidth = containerWidth - (TIMELINE_PADDING_OFFSET * 2);
              const contextStartPixel = TIMELINE_PADDING_OFFSET + ((contextStartFrame - fullMin) / fullRange) * effectiveWidth;
              const contextStartPercent = (contextStartPixel / containerWidth) * 100;

              const generationStartPixel = TIMELINE_PADDING_OFFSET + ((pair.generationStart - fullMin) / fullRange) * effectiveWidth;
              const generationStartPercent = (generationStartPixel / containerWidth) * 100;

              const startImage = images.find(img => img.id === startEntry?.[0]);
              const endImage = images.find(img => img.id === endEntry?.[0]);
              const pairPromptData = pairPrompts?.[index];
              const pairPromptFromMetadata = pairPromptData?.prompt || '';
              const pairNegativePromptFromMetadata = pairPromptData?.negativePrompt || '';
              const enhancedPromptFromProps = enhancedPrompts?.[index] || '';
              const enhancedPromptFromMetadata = startImage?.metadata?.enhanced_prompt || '';
              const actualEnhancedPrompt = enhancedPromptFromProps || enhancedPromptFromMetadata;

              return (
                <PairRegion
                  key={`pair-${index}`}
                  index={index}
                  startPercent={startPercent}
                  endPercent={endPercent}
                  contextStartPercent={contextStartPercent}
                  generationStartPercent={generationStartPercent}
                  actualFrames={actualFrames}
                  visibleContextFrames={visibleContextFrames}
                  isDragging={dragState.isDragging}
                  numPairs={numPairs}
                  startFrame={pair.startFrame}
                  endFrame={pair.endFrame}
                  onPairClick={onPairClick ? (pairIndex, pairData) => {
                    onPairClick(pairIndex, {
                      ...pairData,
                      startImage: startImage ? {
                        id: startImage.id,
                        url: startImage.imageUrl || startImage.thumbUrl,
                        thumbUrl: startImage.thumbUrl,
                        timeline_frame: startImage.timeline_frame ?? 0,
                        position: index + 1
                      } : null,
                      endImage: endImage ? {
                        id: endImage.id,
                        url: endImage.imageUrl || endImage.thumbUrl,
                        thumbUrl: endImage.thumbUrl,
                        timeline_frame: endImage.timeline_frame ?? 0,
                        position: index + 2
                      } : null
                    });
                  } : undefined}
                  pairPrompt={pairPromptFromMetadata}
                  pairNegativePrompt={pairNegativePromptFromMetadata}
                  enhancedPrompt={actualEnhancedPrompt}
                  defaultPrompt={defaultPrompt}
                  defaultNegativePrompt={defaultNegativePrompt}
                  showLabel={showPairLabels}
                  hidePairLabel={
                    (enableTapToMove && selectedIds.length > 0) ||
                    (isFileOver && dropTargetFrame !== null && dropTargetFrame > actualStartFrame && dropTargetFrame < actualEndFrame) ||
                    (dragState.isDragging && currentDragFrame !== null && currentDragFrame > actualStartFrame && currentDragFrame < actualEndFrame)
                  }
                  onClearEnhancedPrompt={onClearEnhancedPrompt}
                  readOnly={readOnly}
                />
              );
            })}

            {/* Trailing endpoint - appears after last image */}
            {/* For single-image: always show (needed for generation) */}
            {/* For multi-image: only show when explicitly enabled (trailingEndFrame is set) */}
            {imagePositions.size > 0 && (() => {
              // Find the last image (highest frame position)
              const sortedEntries = [...imagePositions.entries()].sort((a, b) => a[1] - b[1]);
              const lastEntry = sortedEntries[sortedEntries.length - 1];
              if (!lastEntry) return null;
              const [id, imageFrame] = lastEntry;

              // For multi-image mode, show trailing endpoint when:
              // 1. trailingEndFrame is explicitly set (user added trailing segment), OR
              // 2. A trailing video already exists (need to show marker for it)
              const isMultiImage = images.length > 1;
              const hasTrailingSegment = trailingEndFrame !== undefined;

              console.log('[TrailingStateDebug] TrailingEndpoint render check:', {
                isMultiImage,
                hasTrailingSegment,
                trailingEndFrame,
                hasExistingTrailingVideo,
                trailingVideoUrl: trailingVideoUrl?.substring(0, 30),
                willRender: !(isMultiImage && !hasTrailingSegment && !hasExistingTrailingVideo),
              });

              // Don't render anything on the timeline if multi-image without trailing segment
              // UNLESS a trailing video already exists - then we need to show the marker
              if (isMultiImage && !hasTrailingSegment && !hasExistingTrailingVideo) {
                console.log('[TrailingStateDebug] TrailingEndpoint NOT rendering (multi-image, no segment, no video)');
                return null;
              }

              // Show the trailing endpoint
              const defaultEndFrame = imageFrame + (isMultiImage ? 17 : 49);
              const effectiveEndFrame = trailingEndFrame ?? defaultEndFrame;
              const gapToImage = effectiveEndFrame - imageFrame;
              // Find the corresponding image for pair data
              const lastImageIndex = sortedEntries.length - 1;
              const lastImage = images.find(img => {
                const imgId = img.shot_generation_id || img.id;
                return imgId === id;
              }) || images[lastImageIndex];

              // Trailing segment pair index is after all regular pairs
              const trailingPairIndex = Math.max(0, sortedEntries.length - 1);

              return (
                <TrailingEndpoint
                  framePosition={effectiveEndFrame}
                  imageFramePosition={imageFrame}
                  isDragging={isEndpointDraggingState}
                  dragOffset={null}
                  onMouseDown={readOnly ? undefined : (e, endpointId) => handleEndpointMouseDown(e, endpointId)}
                  timelineWidth={containerWidth}
                  fullMinFrames={fullMin}
                  fullRange={fullRange}
                  currentDragFrame={isEndpointDraggingState ? endpointDragFrame : null}
                  gapToImage={gapToImage}
                  maxAllowedGap={maxAllowedGap}
                  readOnly={readOnly}
                  compact={isMultiImage}
                  onDurationClick={onPairClick && lastImage ? () => {
                    onPairClick(trailingPairIndex, {
                      index: trailingPairIndex,
                      frames: effectiveEndFrame - imageFrame,
                      startFrame: imageFrame,
                      endFrame: effectiveEndFrame,
                      startImage: {
                        id,
                        generationId: lastImage.generation_id,
                        url: lastImage.imageUrl || lastImage.thumbUrl,
                        thumbUrl: lastImage.thumbUrl,
                        position: sortedEntries.length,
                      },
                      endImage: null,
                    });
                  } : undefined}
                  hasTrailingVideo={!!trailingVideoUrl}
                  onExtractFinalFrame={trailingVideoUrl && onFileDrop ? handleExtractFinalFrame : undefined}
                />
              );
            })()}

            {/* Pending frame marker */}
            <PendingFrameMarker
              pendingFrame={activePendingFrame}
              fullMin={fullMin}
              fullRange={fullRange}
              containerWidth={containerWidth}
              imagesLength={images.length}
            />

            {/* Skeleton for uploading item */}
            {(isUploadingImage || isInternalDropProcessing) && pendingDropFrame !== null && (
              <TimelineSkeletonItem
                framePosition={pendingDropFrame}
                fullMin={fullMin}
                fullRange={fullRange}
                containerWidth={containerWidth}
                projectAspectRatio={projectAspectRatio}
              />
            )}

            {/* Skeleton for duplicating item */}
            {pendingDuplicateFrame !== null && (
              <TimelineSkeletonItem
                framePosition={pendingDuplicateFrame}
                fullMin={fullMin}
                fullRange={fullRange}
                containerWidth={containerWidth}
                projectAspectRatio={projectAspectRatio}
              />
            )}

            {/* Skeleton for external add */}
            {pendingExternalAddFrame !== null && (
              <TimelineSkeletonItem
                framePosition={pendingExternalAddFrame}
                fullMin={fullMin}
                fullRange={fullRange}
                containerWidth={containerWidth}
                projectAspectRatio={projectAspectRatio}
              />
            )}

            {/* Timeline items */}
            {images.map((image, idx) => {
              const imageKey = image.id;
              const positionFromMap = currentPositions.get(imageKey);
              const framePosition = positionFromMap ?? image.timeline_frame;
              if (framePosition === undefined || framePosition === null) return null;
              const isDragging = dragState.isDragging && dragState.activeId === imageKey;

              return (
                <TimelineItem
                  key={imageKey}
                  image={image}
                  framePosition={framePosition}
                  isDragging={isDragging}
                  isSwapTarget={swapTargetId === imageKey}
                  dragOffset={isDragging ? dragOffset : null}
                  onMouseDown={readOnly ? undefined : (e) => handleMouseDown(e, imageKey, containerRef)}
                  onDoubleClick={isMobile && !isTablet ? undefined : () => handleDesktopDoubleClick(idx)}
                  onMobileTap={isMobile ? () => handleMobileTap(idx) : undefined}
                  zoomLevel={zoomLevel}
                  timelineWidth={containerWidth}
                  fullMinFrames={fullMin}
                  fullRange={fullRange}
                  currentDragFrame={isDragging ? currentDragFrame : null}
                  dragDistances={isDragging ? dragDistances : null}
                  maxAllowedGap={maxAllowedGap}
                  originalFramePos={framePositions.get(imageKey) ?? 0}
                  onDelete={onImageDelete}
                  onDuplicate={handleDuplicateInterceptor}
                  onInpaintClick={handleInpaintClick ? () => handleInpaintClick(idx) : undefined}
                  duplicatingImageId={duplicatingImageId}
                  duplicateSuccessImageId={duplicateSuccessImageId}
                  projectAspectRatio={projectAspectRatio}
                  readOnly={readOnly}
                  onPrefetch={!isMobile ? () => {
                    const generationId = getGenerationId(image);
                    if (generationId) prefetchTaskData(generationId);
                  } : undefined}
                  isSelected={isSelected(imageKey)}
                  onSelectionClick={readOnly ? undefined : () => toggleSelection(imageKey)}
                  selectedCount={selectedIds.length}
                />
              );
            })}
          </div>
        </div>

        {/* Bottom controls */}
        <TimelineBottomControls
          resetGap={resetGap}
          setResetGap={setResetGap}
          maxGap={maxGap}
          onReset={handleReset}
          onFileDrop={onFileDrop}
          isUploadingImage={isUploadingImage}
          uploadProgress={uploadProgress}
          readOnly={readOnly}
          hasNoImages={hasNoImages}
          zoomLevel={zoomLevel}
        />
      </div>

      {/* Video Browser Modal */}
      <DatasetBrowserModal
        isOpen={showVideoBrowser}
        onOpenChange={setShowVideoBrowser}
        resourceType="structure-video"
        title="Browse Guidance Videos"
        onResourceSelect={handleVideoBrowserSelect}
      />

      {/* Multi-select action bar */}
      {showSelectionBar && selectedIds.length > 0 && !readOnly && (
        <SelectionActionBar
          selectedCount={selectedIds.length}
          onDeselect={clearSelection}
          onDelete={handleDeleteSelected}
          onNewShot={onNewShotFromSelection ? handleNewShotFromSelection : undefined}
          onJumpToShot={onShotChange}
        />
      )}
    </div>
  );
};

export default React.memo(TimelineContainer);
