import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';
import { TIMELINE_PADDING_OFFSET } from '../constants';

// Timeline sub-components (existing)
import TimelineRuler from '../TimelineRuler';
import PairRegion from '../PairRegion';
import TimelineItem from '../TimelineItem';
import TrailingEndpoint from '../TrailingEndpoint';
import { TRAILING_ENDPOINT_KEY, PENDING_POSITION_KEY, getPairInfo, findTrailingVideoInfo } from '../utils/timeline-utils';
import { GuidanceVideoStrip } from '../GuidanceVideoStrip';
import { GuidanceVideoUploader } from '../GuidanceVideoUploader';
import { GuidanceVideosContainer } from '../GuidanceVideosContainer';
import { AudioStrip } from '../AudioStrip';
import { SegmentOutputStrip } from '../SegmentOutputStrip';
import { StructureVideoBrowserModal } from '@/features/resources/components/StructureVideoBrowserModal';
import { SelectionActionBar } from '@/shared/components/ShotImageManager/components/SelectionActionBar';

// Extracted sub-components
import { TimelineControls } from './components/TimelineControls';
import { TimelineTrack } from './components/TimelineTrack';
import { DragLayer } from './components/DragLayer';

// Hooks
import { useTimelineOrchestrator } from '../hooks/timeline-core/useTimelineOrchestrator';
import { useTrailingEndpoint } from '../hooks/segment/useTrailingEndpoint';
import { usePairSettingsHandler } from '../hooks/usePairSettingsHandler';

// Types
import type { TimelineContainerProps } from './types';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { useTimelineMedia } from '../TimelineMediaContext';

function getEnhancedPromptFromMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return '';
  const value = (metadata as { enhanced_prompt?: unknown }).enhanced_prompt;
  return typeof value === 'string' ? value : '';
}

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
  hasNoImages = false,
  maxFrameLimit = 81,
  selectedOutputId,
  onSegmentFrameCountChange,
  segmentSlots: parentSegmentSlots,
  isSegmentsLoading,
  hasPendingTask: parentHasPendingTask,
  videoOutputs,
  onNewShotFromSelection,
  onShotChange,
  onRegisterTrailingUpdater,
}) => {
  // Structure video + audio props from context (provided by ShotImagesEditor)
  const {
    primaryStructureVideoPath,
    primaryStructureVideoMetadata,
    primaryStructureVideoTreatment = 'adjust',
    primaryStructureVideoMotionStrength = 1.0,
    primaryStructureVideoType = 'flow',
    onPrimaryStructureVideoInputChange,
    structureVideos,
    isStructureVideoLoading,
    cachedHasStructureVideo,
    onAddStructureVideo,
    onUpdateStructureVideo,
    onRemoveStructureVideo,
    audioUrl,
    audioMetadata,
    onAudioChange,
  } = useTimelineMedia();

  // ── Trailing segment detection ──────────────────────────────────────────
  // Two-phase design:
  //   PRE-ORCHESTRATOR  → "should the orchestrator reserve trailing space in fullMax?"
  //                       Uses anyImageHasVideo (from segment slots) + readOnly paths.
  //   POST-ORCHESTRATOR → "does the CURRENT live-last image have a video?"
  //                       Uses hasLiveTrailingVideo (segment slots + live imagePositions).
  //
  // The split exists because the orchestrator computes fullMax before we have
  // live drag positions. We tell it to reserve space proactively (small cost:
  // 17 extra frames when any video exists), then do precise detection after.
  // ──────────────────────────────────────────────────────────────────────────

  const trailingEndFrame = framePositions.get(TRAILING_ENDPOINT_KEY);

  const handleTrailingEndFrameChange = useCallback((endFrame: number | undefined) => {
    const next = new Map(framePositions);
    if (endFrame === undefined) {
      next.delete(TRAILING_ENDPOINT_KEY);
    } else {
      next.set(TRAILING_ENDPOINT_KEY, endFrame);
    }
    setFramePositions(next);
  }, [framePositions, setFramePositions]);

  useLayoutEffect(() => {
    onRegisterTrailingUpdater?.(handleTrailingEndFrameChange);
  }, [onRegisterTrailingUpdater, handleTrailingEndFrameChange]);

  // ReadOnly path: detect trailing video synchronously from preloaded generations.
  // In editing mode videoOutputs is undefined — this returns { false, null }.
  const { hasTrailing: hasExistingTrailingVideo, videoUrl: computedTrailingVideoUrl } = useMemo(() => {
    if (!videoOutputs || videoOutputs.length === 0 || images.length === 0) {
      return { hasTrailing: false, videoUrl: null };
    }
    const sortedEntries = [...framePositions.entries()]
      .filter(([id]) => id !== TRAILING_ENDPOINT_KEY)
      .sort((a, b) => a[1] - b[1]);
    const lastImageShotGenId = sortedEntries[sortedEntries.length - 1]?.[0] || null;
    return findTrailingVideoInfo(videoOutputs, lastImageShotGenId);
  }, [videoOutputs, framePositions, images.length]);

  // Async path: strip reports trailing video URL via callback once the slot is visible.
  // Safety net when parentSegmentSlots (React Query) hasn't refreshed yet.
  const [callbackTrailingVideoUrl, setCallbackTrailingVideoUrl] = useState<string | null>(null);
  const hasCallbackTrailingVideo = hasExistingTrailingVideo || !!callbackTrailingVideoUrl;

  // PRE-ORCHESTRATOR: does ANY image have a completed video segment?
  // Proactive reservation — small cost (17 frames padding) eliminates chicken-and-egg.
  const anyImageHasVideo = useMemo(() => {
    if (parentSegmentSlots?.length) {
      return parentSegmentSlots.some(slot =>
        slot.type === 'child' &&
        slot.child.type?.includes('video') &&
        slot.child.location
      );
    }
    return false;
  }, [parentSegmentSlots]);

  // --- Orchestrator hook (grouped domain view-model) ---
  const orchestrator = useTimelineOrchestrator({
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
    primaryStructureVideoType,
    primaryStructureVideoTreatment,
    primaryStructureVideoMotionStrength,
    onAddStructureVideo,
    onUpdateStructureVideo,
    onPrimaryStructureVideoInputChange,
    hasExistingTrailingVideo: hasCallbackTrailingVideo || anyImageHasVideo,
  });
  const { timelineRef, containerRef } = orchestrator.refs;
  const {
    fullMin,
    fullMax,
    fullRange,
    containerWidth,
    zoomLevel,
    handleZoomInToCenter,
    handleZoomOutFromCenter,
    handleZoomReset,
    handleZoomToStart,
    handleTimelineDoubleClick,
  } = orchestrator.viewport;
  const {
    state: dragState,
    dragOffset,
    currentDragFrame,
    swapTargetId,
    pushMode,
    handleMouseDown,
  } = orchestrator.drag;
  const { selectedIds, showSelectionBar, isSelected, toggleSelection, clearSelection } = orchestrator.selection;
  const {
    pendingDropFrame,
    pendingDuplicateFrame,
    pendingExternalAddFrame,
    activePendingFrame,
    isInternalDropProcessing,
  } = orchestrator.pending;
  const {
    isFileOver,
    dropTargetFrame,
    dragType,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
  } = orchestrator.drop;
  const { currentPositions, pairInfo, pairDataByIndex, localShotGenPositions, showPairLabels } = orchestrator.computed;
  const { handleDuplicateInterceptor, handleTimelineTapToMove, handleVideoBrowserSelect, handleEndpointMouseDown } = orchestrator.actions;
  const { endpointDragFrame, isEndpointDragging: isEndpointDraggingState } = orchestrator.endpoint;
  const {
    resetGap,
    setResetGap,
    maxGap,
    showVideoBrowser,
    setShowVideoBrowser,
    isUploadingStructureVideo,
    setIsUploadingStructureVideo,
  } = orchestrator.uiState;
  const { isMobile, isTablet, enableTapToMove, prefetchTaskData } = orchestrator.device;

  // --- Post-orchestrator trailing endpoint (needs currentPositions) ---
  const {
    trailingVideoUrl,
    handleExtractFinalFrame,
    imagePositions,
  } = useTrailingEndpoint({
    currentPositions,
    trailingEndFrame,
    computedTrailingVideoUrl,
    callbackTrailingVideoUrl,
    setCallbackTrailingVideoUrl,
    onFileDrop,
  });

  // Live trailing detection: check if any completed video is anchored to the current
  // live last image. Auto-reveals trailing slot during drag without waiting for DB.
  const liveLastImageShotGenId = useMemo(() => {
    const sorted = [...imagePositions.entries()].sort((a, b) => a[1] - b[1]);
    return sorted[sorted.length - 1]?.[0] ?? null;
  }, [imagePositions]);

  const hasLiveTrailingVideo = useMemo(() => {
    if (!liveLastImageShotGenId) return false;
    // In editing mode, videoOutputs is undefined — use parentSegmentSlots instead.
    // Segment slots know which image each video is anchored to (pairShotGenerationId).
    if (parentSegmentSlots?.length) {
      return parentSegmentSlots.some(slot =>
        slot.type === 'child' &&
        slot.pairShotGenerationId === liveLastImageShotGenId &&
        slot.child.type?.includes('video') &&
        slot.child.location
      );
    }
    // Fallback for readOnly mode where videoOutputs is available
    if (videoOutputs) {
      return findTrailingVideoInfo(videoOutputs, liveLastImageShotGenId).hasTrailing;
    }
    return false;
  }, [liveLastImageShotGenId, parentSegmentSlots, videoOutputs]);

  // --- Derived pair data (augmented with pending items) ---
  const imagePositionsWithPending = useMemo(() => {
    if (activePendingFrame === null) return imagePositions;
    const realItemAtFrame = [...imagePositions.values()].some(pos => pos === activePendingFrame);
    if (realItemAtFrame) return imagePositions;
    const augmented = new Map(imagePositions);
    augmented.set(PENDING_POSITION_KEY, activePendingFrame);
    return augmented;
  }, [imagePositions, activePendingFrame]);

  const pairInfoWithPending = useMemo(() => {
    if (activePendingFrame === null) return pairInfo;
    return getPairInfo(imagePositionsWithPending);
  }, [pairInfo, activePendingFrame, imagePositionsWithPending]);

  const numPairs = Math.max(0, images.length - 1);
  const maxAllowedGap = 81;

  // --- Pair settings handler ---
  const { handleOpenPairSettings } = usePairSettingsHandler({
    images,
    imagePositions,
    trailingEndFrame,
    pairInfo,
    pairDataByIndex,
    onPairClick,
  });

  // --- Simple handlers ---
  const handleReset = useCallback(() => {
    if (images.length === 1) {
      const newPositions = new Map<string, number>();
      newPositions.set(images[0].id, 0);
      newPositions.set(TRAILING_ENDPOINT_KEY, resetGap);
      setFramePositions(newPositions);
    } else {
      onResetFrames(resetGap);
    }
  }, [onResetFrames, resetGap, images, setFramePositions]);

  const handleDeleteSelected = useCallback(() => {
    selectedIds.forEach(id => onImageDelete(id));
    clearSelection();
  }, [selectedIds, onImageDelete, clearSelection]);

  const handleNewShotFromSelection = useCallback(async () => {
    if (!onNewShotFromSelection) return;
    const newShotId = await onNewShotFromSelection(selectedIds);
    return newShotId;
  }, [onNewShotFromSelection, selectedIds]);

  // --- JSX ---
  return (
    <div className="w-full overflow-x-hidden relative">
      <div className="relative">
        <TimelineControls
          shotId={shotId}
          projectId={projectId}
          readOnly={readOnly}
          hasNoImages={hasNoImages}
          zoomLevel={zoomLevel}
          fullMax={fullMax}
          audioUrl={audioUrl}
          onAudioChange={onAudioChange}
          primaryStructureVideoPath={primaryStructureVideoPath}
          primaryStructureVideoType={primaryStructureVideoType}
          primaryStructureVideoTreatment={primaryStructureVideoTreatment}
          primaryStructureVideoMotionStrength={primaryStructureVideoMotionStrength}
          structureVideos={structureVideos}
          onAddStructureVideo={onAddStructureVideo}
          onUpdateStructureVideo={onUpdateStructureVideo}
          onPrimaryStructureVideoInputChange={onPrimaryStructureVideoInputChange}
          onShowVideoBrowser={() => setShowVideoBrowser(true)}
          isUploadingStructureVideo={isUploadingStructureVideo}
          setIsUploadingStructureVideo={setIsUploadingStructureVideo}
          onZoomIn={handleZoomInToCenter}
          onZoomOut={handleZoomOutFromCenter}
          onZoomReset={handleZoomReset}
          onZoomToStart={handleZoomToStart}
          resetGap={resetGap}
          setResetGap={setResetGap}
          maxGap={maxGap}
          onReset={handleReset}
          onFileDrop={onFileDrop}
          isUploadingImage={isUploadingImage}
          uploadProgress={uploadProgress}
          pushMode={pushMode}
          showDragHint={!!(dragState.isDragging && dragState.activeId && !isMobile)}
        />

        <TimelineTrack
          timelineRef={timelineRef}
          containerRef={containerRef}
          zoomLevel={zoomLevel}
          isFileOver={isFileOver}
          hasNoImages={hasNoImages}
          enableTapToMove={enableTapToMove}
          selectedCount={selectedIds.length}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onContainerDoubleClick={handleTimelineDoubleClick}
          onContainerClick={(e) => {
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
          containerWidth={containerWidth}
          prelude={(
            <>
              {/* Segment output strip */}
              {shotId && (projectId || (readOnly && videoOutputs)) && (() => {
            const sortedEntries = imagePositions.size > 0
              ? [...imagePositions.entries()].sort((a, b) => a[1] - b[1])
              : [];
            const lastEntry = sortedEntries[sortedEntries.length - 1];
            const isMultiImage = images.length > 1;
            const realLastFrame = lastEntry ? lastEntry[1] : undefined;
            const pendingIsLast = activePendingFrame !== null &&
              realLastFrame !== undefined &&
              activePendingFrame > realLastFrame;
            const effectiveLastFrame = pendingIsLast ? activePendingFrame : realLastFrame;

            return (
              <SegmentOutputStrip
                shotId={shotId}
                projectId={projectId}
                readOnly={readOnly}
                projectAspectRatio={projectAspectRatio}
                pairInfo={pairInfoWithPending}
                fullMin={fullMin}
                fullMax={fullMax}
                fullRange={fullRange}
                containerWidth={containerWidth}
                zoomLevel={zoomLevel}
                segmentSlots={parentSegmentSlots ?? []}
                isLoading={isSegmentsLoading}
                localShotGenPositions={localShotGenPositions}
                hasPendingTask={parentHasPendingTask}
                pairDataByIndex={pairDataByIndex}
                onOpenPairSettings={onPairClick ? handleOpenPairSettings : undefined}
                selectedParentId={selectedOutputId}
                onSegmentFrameCountChange={onSegmentFrameCountChange}
                trailingSegmentMode={lastEntry && (trailingEndFrame !== undefined || hasCallbackTrailingVideo || hasLiveTrailingVideo) ? (() => {
                  const [imageId, imageFrame] = lastEntry;
                  const resolvedEndFrame = trailingEndFrame ?? (imageFrame + (isMultiImage ? 17 : 49));
                  const trailingDuration = resolvedEndFrame - imageFrame;
                  const effectiveImageId = pendingIsLast ? PENDING_POSITION_KEY : imageId;
                  const effectiveImageFrame = pendingIsLast ? activePendingFrame! : imageFrame;
                  const effectiveEndFrame = pendingIsLast ? activePendingFrame! + trailingDuration : resolvedEndFrame;
                  return { imageId: effectiveImageId, imageFrame: effectiveImageFrame, endFrame: effectiveEndFrame };
                })() : undefined}
                isMultiImage={isMultiImage}
                lastImageFrame={effectiveLastFrame}
                onAddTrailingSegment={realLastFrame !== undefined && lastEntry ? () => {
                  handleTrailingEndFrameChange(realLastFrame + 17);
                } : undefined}
                onRemoveTrailingSegment={isMultiImage && trailingEndFrame !== undefined ? () => {
                  handleTrailingEndFrameChange(undefined);
                } : undefined}
                onTrailingVideoInfo={setCallbackTrailingVideoUrl}
              />
                );
              })()}

              {/* Structure video strip(s) */}
              {shotId && (projectId || readOnly) && (
                structureVideos && onUpdateStructureVideo && onRemoveStructureVideo ? (
                  <GuidanceVideosContainer
                    structureVideos={structureVideos}
                    isLoading={isStructureVideoLoading}
                    cachedHasStructureVideo={cachedHasStructureVideo}
                    shotId={shotId}
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
                ) : onPrimaryStructureVideoInputChange && (
                  primaryStructureVideoPath ? (
                    <GuidanceVideoStrip
                      videoUrl={primaryStructureVideoPath}
                      videoMetadata={primaryStructureVideoMetadata || null}
                      treatment={primaryStructureVideoTreatment}
                      onTreatmentChange={(treatment) => onPrimaryStructureVideoInputChange(primaryStructureVideoPath, primaryStructureVideoMetadata ?? null, treatment, primaryStructureVideoMotionStrength, primaryStructureVideoType)}
                      onRemove={() => onPrimaryStructureVideoInputChange(null, null, 'adjust', 1.0, 'flow')}
                      onMetadataExtracted={(metadata) => onPrimaryStructureVideoInputChange(primaryStructureVideoPath, metadata, primaryStructureVideoTreatment, primaryStructureVideoMotionStrength, primaryStructureVideoType)}
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
                      projectId={projectId ?? ''}
                      onVideoUploaded={(videoUrl, metadata) => {
                        if (videoUrl && metadata) onPrimaryStructureVideoInputChange(videoUrl, metadata, primaryStructureVideoTreatment, primaryStructureVideoMotionStrength, primaryStructureVideoType);
                      }}
                      currentVideoUrl={primaryStructureVideoPath ?? null}
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
                    compact={!!primaryStructureVideoPath}
                  />
                </div>
              )}
            </>
          )}
        >
            <DragLayer
              isFileOver={isFileOver}
              dropTargetFrame={dropTargetFrame}
              fullMin={fullMin}
              fullRange={fullRange}
              containerWidth={containerWidth}
              dragType={dragType}
              activePendingFrame={activePendingFrame}
              pendingDropFrame={pendingDropFrame}
              pendingDuplicateFrame={pendingDuplicateFrame}
              pendingExternalAddFrame={pendingExternalAddFrame}
              isUploadingImage={isUploadingImage}
              isInternalDropProcessing={isInternalDropProcessing}
              projectAspectRatio={projectAspectRatio}
              imagesLength={images.length}
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
            {(() => {
              const sortedDynamicPositions = [...imagePositionsWithPending.entries()].sort((a, b) => a[1] - b[1]);
              return pairInfoWithPending.map((pair, index) => {
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
              const actualEnhancedPrompt = getEnhancedPromptFromMetadata(startImage?.metadata);

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
                        generationId: startImage.generation_id || undefined,
                        primaryVariantId: startImage.primary_variant_id || undefined,
                        url: startImage.imageUrl || startImage.thumbUrl,
                        thumbUrl: startImage.thumbUrl,
                        position: index + 1
                      } : null,
                      endImage: endImage ? {
                        id: endImage.id,
                        generationId: endImage.generation_id || undefined,
                        primaryVariantId: endImage.primary_variant_id || undefined,
                        url: endImage.imageUrl || endImage.thumbUrl,
                        thumbUrl: endImage.thumbUrl,
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
            });
            })()}

            {/* Trailing endpoint - appears after last image */}
            {imagePositions.size > 0 && (() => {
              const sortedEntries = [...imagePositions.entries()].sort((a, b) => a[1] - b[1]);
              const lastEntry = sortedEntries[sortedEntries.length - 1];
              if (!lastEntry) return null;
              const [id, imageFrame] = lastEntry;

              const isMultiImage = images.length > 1;
              const hasTrailingSegment = trailingEndFrame !== undefined;

              if (isMultiImage && !hasTrailingSegment && !hasCallbackTrailingVideo && !hasLiveTrailingVideo) {
                return null;
              }

              const defaultEndFrame = imageFrame + (isMultiImage ? 17 : 49);
              const effectiveEndFrame = trailingEndFrame ?? defaultEndFrame;
              const gapToImage = effectiveEndFrame - imageFrame;
              const lastImageIndex = sortedEntries.length - 1;
              const lastImage = images.find(img => {
                const imgId = img.shot_generation_id || img.id;
                return imgId === id;
              }) || images[lastImageIndex];

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
                  layout={{
                    timelineWidth: containerWidth,
                    fullMinFrames: fullMin,
                    fullRange,
                  }}
                  interaction={{
                    isDragging,
                    isSwapTarget: swapTargetId === imageKey,
                    dragOffset: isDragging ? dragOffset : null,
                    onMouseDown: readOnly ? undefined : (e) => handleMouseDown(e, imageKey, containerRef),
                    onDoubleClick: isMobile && !isTablet ? undefined : () => handleDesktopDoubleClick(idx),
                    onMobileTap: isMobile ? () => handleMobileTap(idx) : undefined,
                    currentDragFrame: isDragging ? currentDragFrame : null,
                    originalFramePos: framePositions.get(imageKey) ?? 0,
                    onPrefetch: !isMobile ? () => {
                      const generationId = getGenerationId(image);
                      if (generationId) prefetchTaskData(generationId);
                    } : undefined,
                  }}
                  actions={{
                    onDelete: onImageDelete,
                    onDuplicate: handleDuplicateInterceptor,
                    onInpaintClick: handleInpaintClick ? () => handleInpaintClick(idx) : undefined,
                    duplicatingImageId: duplicatingImageId ?? undefined,
                    duplicateSuccessImageId: duplicateSuccessImageId ?? undefined,
                  }}
                  selection={{
                    isSelected: isSelected(imageKey),
                    onSelectionClick: readOnly ? undefined : () => toggleSelection(imageKey),
                    selectedCount: selectedIds.length,
                  }}
                  presentation={{
                    projectAspectRatio,
                    readOnly,
                  }}
                />
              );
            })}
        </TimelineTrack>
      </div>

      {/* Video Browser Modal */}
      <StructureVideoBrowserModal
        isOpen={showVideoBrowser}
        onOpenChange={setShowVideoBrowser}
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
