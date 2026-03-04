import React, { useCallback, useLayoutEffect, useMemo, useState } from 'react';

import TimelineRuler from '../TimelineRuler';
import {
  TRAILING_ENDPOINT_KEY,
  PENDING_POSITION_KEY,
  findTrailingVideoInfo,
  getPairInfo,
  sortPositionEntries,
} from '../utils/timeline-utils';
import { ResourceBrowserModalBase } from '@/features/resources/components/ResourceBrowserModalBase';
import { SelectionActionBar } from '@/shared/components/ShotImageManager/components/SelectionActionBar';

import { TimelineControls } from './components/TimelineControls';
import { TimelineTrack } from './components/TimelineTrack';
import { DragLayer } from './components/DragLayer';
import { TimelineTrackPrelude } from './components/TimelineTrackPrelude';
import { PairRegionsLayer } from './components/PairRegionsLayer';
import { TrailingEndpointLayer } from './components/TrailingEndpointLayer';
import { TimelineItemsLayer } from './components/TimelineItemsLayer';

import { useTimelineOrchestrator } from '../hooks/timeline-core/useTimelineOrchestrator';
import { useTrailingEndpoint } from '../hooks/segment/useTrailingEndpoint';
import { usePairSettingsHandler } from '../hooks/usePairSettingsHandler';

import type { TimelineContainerProps } from './types';
import { useTimelineMedia } from '../TimelineMediaContext';
import { resolvePrimaryStructureVideo } from '../../structureVideo/primaryStructureVideoAdapter';

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
  const {
    primaryStructureVideoPath,
    primaryStructureVideoMetadata,
    primaryStructureVideoTreatment,
    primaryStructureVideoMotionStrength,
    primaryStructureVideoType,
    primaryStructureVideoUni3cEndPercent,
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

  const primaryStructureVideo = resolvePrimaryStructureVideo({
    structureVideos,
    primaryStructureVideoPath,
    primaryStructureVideoMetadata,
    primaryStructureVideoTreatment,
    primaryStructureVideoMotionStrength,
    primaryStructureVideoType,
    primaryStructureVideoUni3cEndPercent,
  });

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

  const [callbackTrailingVideoUrl, setCallbackTrailingVideoUrl] = useState<string | null>(null);
  const hasCallbackTrailingVideo = hasExistingTrailingVideo || !!callbackTrailingVideoUrl;

  const anyImageHasVideo = useMemo(() => {
    if (parentSegmentSlots?.length) {
      return parentSegmentSlots.some((slot) => (
        slot.type === 'child'
        && slot.child.type?.includes('video')
        && slot.child.location
      ));
    }
    return false;
  }, [parentSegmentSlots]);

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
    primaryStructureVideoType: primaryStructureVideo.structureType,
    primaryStructureVideoTreatment: primaryStructureVideo.treatment,
    primaryStructureVideoMotionStrength: primaryStructureVideo.motionStrength,
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
  const {
    currentPositions,
    pairInfo,
    pairDataByIndex,
    localShotGenPositions,
    showPairLabels,
  } = orchestrator.computed;
  const {
    handleDuplicateInterceptor,
    handleTimelineTapToMove,
    handleVideoBrowserSelect,
    handleEndpointMouseDown,
  } = orchestrator.actions;
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

  const liveLastImageShotGenId = useMemo(() => {
    const sorted = sortPositionEntries(imagePositions);
    return sorted[sorted.length - 1]?.[0] ?? null;
  }, [imagePositions]);

  const hasLiveTrailingVideo = useMemo(() => {
    if (!liveLastImageShotGenId) {
      return false;
    }

    if (parentSegmentSlots?.length) {
      return parentSegmentSlots.some((slot) => (
        slot.type === 'child'
        && slot.pairShotGenerationId === liveLastImageShotGenId
        && slot.child.type?.includes('video')
        && slot.child.location
      ));
    }

    if (videoOutputs) {
      return findTrailingVideoInfo(videoOutputs, liveLastImageShotGenId).hasTrailing;
    }

    return false;
  }, [liveLastImageShotGenId, parentSegmentSlots, videoOutputs]);

  const imagePositionsWithPending = useMemo(() => {
    if (activePendingFrame === null) {
      return imagePositions;
    }
    const realItemAtFrame = [...imagePositions.values()].some((pos) => pos === activePendingFrame);
    if (realItemAtFrame) {
      return imagePositions;
    }
    const augmented = new Map(imagePositions);
    augmented.set(PENDING_POSITION_KEY, activePendingFrame);
    return augmented;
  }, [imagePositions, activePendingFrame]);

  const pairInfoWithPending = useMemo(() => {
    if (activePendingFrame === null) {
      return pairInfo;
    }
    return getPairInfo(imagePositionsWithPending);
  }, [pairInfo, activePendingFrame, imagePositionsWithPending]);

  const { handleOpenPairSettings } = usePairSettingsHandler({
    images,
    imagePositions,
    trailingEndFrame,
    pairInfo,
    pairDataByIndex,
    onPairClick,
  });

  const handleReset = useCallback(() => {
    if (images.length === 1) {
      const newPositions = new Map<string, number>();
      newPositions.set(images[0].id, 0);
      newPositions.set(TRAILING_ENDPOINT_KEY, resetGap);
      setFramePositions(newPositions);
      return;
    }

    onResetFrames(resetGap);
  }, [onResetFrames, resetGap, images, setFramePositions]);

  const handleDeleteSelected = useCallback(() => {
    selectedIds.forEach((id) => onImageDelete(id));
    clearSelection();
  }, [selectedIds, onImageDelete, clearSelection]);

  const handleNewShotFromSelection = useCallback(async () => {
    if (!onNewShotFromSelection) {
      return;
    }
    return onNewShotFromSelection(selectedIds);
  }, [onNewShotFromSelection, selectedIds]);

  return (
    <div className="w-full overflow-x-hidden relative">
      <div className="relative">
        <TimelineControls
          timeline={{
            shotId,
            projectId,
            readOnly,
            hasNoImages,
            zoomLevel,
            fullMax,
            showDragHint: !!(dragState.isDragging && dragState.activeId && !isMobile),
          }}
          audio={{
            audioUrl,
            onAudioChange,
          }}
          guidance={{
            primaryStructureVideoPath: primaryStructureVideo.path,
            primaryStructureVideoType: primaryStructureVideo.structureType,
            primaryStructureVideoTreatment: primaryStructureVideo.treatment,
            primaryStructureVideoMotionStrength: primaryStructureVideo.motionStrength,
            structureVideos,
            onAddStructureVideo,
            onUpdateStructureVideo,
            onPrimaryStructureVideoInputChange,
            onShowVideoBrowser: () => setShowVideoBrowser(true),
            isUploadingStructureVideo,
            setIsUploadingStructureVideo,
          }}
          zoom={{
            onZoomIn: handleZoomInToCenter,
            onZoomOut: handleZoomOutFromCenter,
            onZoomReset: handleZoomReset,
            onZoomToStart: handleZoomToStart,
          }}
          bottom={{
            resetGap,
            setResetGap,
            maxGap,
            onReset: handleReset,
            onFileDrop,
            isUploadingImage,
            uploadProgress,
            pushMode,
          }}
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
              if (selectedIds.length > 0) {
                clearSelection();
              }
            }
          }}
          containerWidth={containerWidth}
          prelude={(
            <TimelineTrackPrelude
              timeline={{
                shotId,
                projectId,
                readOnly,
                images,
                imagePositions,
                activePendingFrame,
                trailingEndFrame,
                hasCallbackTrailingVideo,
                hasLiveTrailingVideo,
                projectAspectRatio,
                pairInfoWithPending,
                pairDataByIndex,
                localShotGenPositions,
                segmentSlots: parentSegmentSlots,
                isSegmentsLoading,
                hasPendingTask: parentHasPendingTask,
                selectedOutputId,
                onPairClick,
                onOpenPairSettings: handleOpenPairSettings,
                onSegmentFrameCountChange,
                onTrailingEndFrameChange: handleTrailingEndFrameChange,
                onTrailingVideoInfo: setCallbackTrailingVideoUrl,
                onFileDrop,
                videoOutputs,
              }}
              guidance={{
                structureVideos,
                isStructureVideoLoading,
                cachedHasStructureVideo,
                onAddStructureVideo,
                onUpdateStructureVideo,
                onRemoveStructureVideo,
                primaryStructureVideoPath: primaryStructureVideo.path,
                primaryStructureVideoMetadata: primaryStructureVideo.metadata,
                primaryStructureVideoTreatment: primaryStructureVideo.treatment,
                primaryStructureVideoMotionStrength: primaryStructureVideo.motionStrength,
                primaryStructureVideoType: primaryStructureVideo.structureType,
                onPrimaryStructureVideoInputChange,
                isUploadingStructureVideo,
                setIsUploadingStructureVideo,
              }}
              audio={{
                audioUrl,
                audioMetadata,
                onAudioChange,
              }}
              layout={{
                fullMin,
                fullMax,
                fullRange,
                containerWidth,
                zoomLevel,
                hasNoImages,
              }}
              zoom={{
                onZoomIn: handleZoomInToCenter,
                onZoomOut: handleZoomOutFromCenter,
                onZoomReset: handleZoomReset,
                onZoomToStart: handleZoomToStart,
              }}
            />
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

          <PairRegionsLayer
            images={images}
            imagePositionsWithPending={imagePositionsWithPending}
            pairInfoWithPending={pairInfoWithPending}
            pairPrompts={pairPrompts}
            defaultPrompt={defaultPrompt}
            defaultNegativePrompt={defaultNegativePrompt}
            showPairLabels={showPairLabels}
            dragState={{
              isDragging: dragState.isDragging,
            }}
            onPairClick={onPairClick}
            onClearEnhancedPrompt={onClearEnhancedPrompt}
            readOnly={readOnly}
            enableTapToMove={enableTapToMove}
            selectedIdsCount={selectedIds.length}
            isFileOver={isFileOver}
            dropTargetFrame={dropTargetFrame}
            currentDragFrame={currentDragFrame}
            fullMin={fullMin}
            fullRange={fullRange}
            containerWidth={containerWidth}
          />

          <TrailingEndpointLayer
            imagePositions={imagePositions}
            images={images}
            trailingEndFrame={trailingEndFrame}
            hasCallbackTrailingVideo={hasCallbackTrailingVideo}
            hasLiveTrailingVideo={hasLiveTrailingVideo}
            isEndpointDragging={isEndpointDraggingState}
            endpointDragFrame={endpointDragFrame}
            containerWidth={containerWidth}
            fullMin={fullMin}
            fullRange={fullRange}
            maxAllowedGap={81}
            readOnly={readOnly}
            onEndpointMouseDown={handleEndpointMouseDown}
            onPairClick={onPairClick}
            trailingVideoUrl={trailingVideoUrl}
            onExtractFinalFrame={onFileDrop ? handleExtractFinalFrame : undefined}
          />

          <TimelineItemsLayer
            images={images}
            currentPositions={currentPositions}
            framePositions={framePositions}
            drag={{
              isDragging: dragState.isDragging,
              activeId: dragState.activeId,
              dragOffset,
              currentDragFrame,
              swapTargetId,
            }}
            layout={{
              containerWidth,
              fullMin,
              fullRange,
            }}
            interaction={{
              readOnly,
              isMobile,
              isTablet,
              containerRef,
              handleMouseDown,
              handleDesktopDoubleClick,
              handleMobileTap,
              prefetchTaskData,
            }}
            actions={{
              onImageDelete,
              onImageDuplicate: handleDuplicateInterceptor,
              onInpaintClick: handleInpaintClick,
              duplicatingImageId,
              duplicateSuccessImageId,
            }}
            selection={{
              isSelected,
              toggleSelection,
              selectedCount: selectedIds.length,
            }}
            presentation={{
              projectAspectRatio,
            }}
          />
        </TimelineTrack>
      </div>

      <ResourceBrowserModalBase
        isOpen={showVideoBrowser}
        onOpenChange={setShowVideoBrowser}
        resourceType="structure-video"
        title="Browse Guidance Videos"
        onResourceSelect={handleVideoBrowserSelect}
      />

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
