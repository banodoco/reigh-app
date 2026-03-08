import React from 'react';
import { TimelineRuler } from '../../TimelineRuler';
import { TimelineTrack } from './TimelineTrack';
import { TimelineTrackPrelude } from './TimelineTrackPrelude';
import { DragLayer } from './DragLayer';
import { PairRegionsLayer } from './PairRegionsLayer';
import { TrailingEndpointLayer } from './TrailingEndpointLayer';
import { TimelineItemsLayer } from './TimelineItemsLayer';

interface TimelineTrackContentProps {
  data: Record<string, unknown>;
}

export const TimelineTrackContent: React.FC<TimelineTrackContentProps> = ({ data }) => {
  const {
    timelineRef,
    containerRef,
    zoomLevel,
    isFileOver,
    hasNoImages,
    enableTapToMove,
    selectedIds,
    handleDragEnter,
    handleDragOver,
    handleDragLeave,
    handleDrop,
    handleTimelineDoubleClick,
    handleTimelineTapToMove,
    clearSelection,
    containerWidth,
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
    parentSegmentSlots,
    isSegmentsLoading,
    parentHasPendingTask,
    selectedOutputId,
    onPairClick,
    handleOpenPairSettings,
    onSegmentFrameCountChange,
    handleTrailingEndFrameChange,
    setCallbackTrailingVideoUrl,
    onFileDrop,
    videoOutputs,
    structureVideos,
    isStructureVideoLoading,
    cachedHasStructureVideo,
    onAddStructureVideo,
    onUpdateStructureVideo,
    onRemoveStructureVideo,
    primaryStructureVideo,
    onPrimaryStructureVideoInputChange,
    isUploadingStructureVideo,
    setIsUploadingStructureVideo,
    audioUrl,
    audioMetadata,
    onAudioChange,
    fullMin,
    fullMax,
    fullRange,
    handleZoomInToCenter,
    handleZoomOutFromCenter,
    handleZoomReset,
    handleZoomToStart,
    dragState,
    dragType,
    dropTargetFrame,
    pendingDropFrame,
    pendingDuplicateFrame,
    pendingExternalAddFrame,
    isUploadingImage,
    isInternalDropProcessing,
    currentDragFrame,
    swapTargetId,
    endpointDragFrame,
    isEndpointDraggingState,
    handleEndpointMouseDown,
    trailingVideoUrl,
    handleExtractFinalFrame,
    framePositions,
    dragOffset,
    isMobile,
    isTablet,
    handleMouseDown,
    handleDesktopDoubleClick,
    handleMobileTap,
    prefetchTaskData,
    onImageDelete,
    handleDuplicateInterceptor,
    handleInpaintClick,
    duplicatingImageId,
    duplicateSuccessImageId,
    isSelected,
    toggleSelection,
  } = data;

  return (
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
            primaryStructureVideo,
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
        imagePositionsWithPending={imagePositions}
        pairInfoWithPending={pairInfoWithPending}
        pairPrompts={data.pairPrompts}
        defaultPrompt={data.defaultPrompt}
        defaultNegativePrompt={data.defaultNegativePrompt}
        showPairLabels={data.showPairLabels}
        dragState={{
          isDragging: dragState.isDragging,
        }}
        onPairClick={onPairClick}
        onClearEnhancedPrompt={data.onClearEnhancedPrompt}
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
        currentPositions={data.currentPositions}
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
  );
};
