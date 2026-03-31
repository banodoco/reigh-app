// @vitest-environment jsdom

import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineTrackContent } from './TimelineTrackContent';

const captures = vi.hoisted(() => ({
  trackProps: null as unknown,
  preludeProps: null as unknown,
  dragLayerProps: null as unknown,
  pairRegionsProps: null as unknown,
  trailingProps: null as unknown,
  itemsLayerProps: null as unknown,
}));

vi.mock('../../TimelineRuler', () => ({
  TimelineRuler: () => <div data-testid="timeline-ruler" />,
}));

vi.mock('./TimelineTrack', () => ({
  TimelineTrack: (props: { children: React.ReactNode; onContainerClick: (e: React.MouseEvent) => void; prelude: React.ReactNode }) => {
    captures.trackProps = props;
    return (
      <div data-testid="timeline-track">
        <div data-testid="timeline-prelude">{props.prelude}</div>
        {props.children}
      </div>
    );
  },
}));

vi.mock('./TimelineTrackPrelude', () => ({
  TimelineTrackPrelude: (props: unknown) => {
    captures.preludeProps = props;
    return <div data-testid="track-prelude-component" />;
  },
}));

vi.mock('./DragLayer', () => ({
  DragLayer: (props: unknown) => {
    captures.dragLayerProps = props;
    return <div data-testid="drag-layer" />;
  },
}));

vi.mock('./PairRegionsLayer', () => ({
  PairRegionsLayer: (props: unknown) => {
    captures.pairRegionsProps = props;
    return <div data-testid="pair-regions-layer" />;
  },
}));

vi.mock('./TrailingEndpointLayer', () => ({
  TrailingEndpointLayer: (props: unknown) => {
    captures.trailingProps = props;
    return <div data-testid="trailing-endpoint-layer" />;
  },
}));

vi.mock('./TimelineItemsLayer', () => ({
  TimelineItemsLayer: (props: unknown) => {
    captures.itemsLayerProps = props;
    return <div data-testid="timeline-items-layer" />;
  },
}));

describe('TimelineTrackContent', () => {
  beforeEach(() => {
    captures.trackProps = null;
    captures.preludeProps = null;
    captures.dragLayerProps = null;
    captures.pairRegionsProps = null;
    captures.trailingProps = null;
    captures.itemsLayerProps = null;
  });

  function buildData() {
    return {
      timelineRef: { current: null },
      containerRef: { current: null },
      zoomLevel: 1,
      isFileOver: false,
      hasNoImages: false,
      enableTapToMove: false,
      selectedIds: ['img-1'],
      handleDragEnter: vi.fn(),
      handleDragOver: vi.fn(),
      handleDragLeave: vi.fn(),
      handleDrop: vi.fn(),
      handleTimelineDoubleClick: vi.fn(),
      handleTimelineTapToMove: vi.fn(),
      clearSelection: vi.fn(),
      containerWidth: 300,
      shotId: 'shot-1',
      projectId: 'project-1',
      readOnly: false,
      images: [{ id: 'img-1' }],
      imagePositions: new Map([['img-1', 0]]),
      activePendingFrame: null,
      trailingEndFrame: 81,
      hasCallbackTrailingVideo: false,
      hasLiveTrailingVideo: false,
      projectAspectRatio: '16:9',
      pairInfoWithPending: [{ index: 0 }],
      pairDataByIndex: new Map([[0, { index: 0 }]]),
      localShotGenPositions: new Map([['img-1', 0]]),
      parentSegmentSlots: [{ id: 'slot-1' }],
      isSegmentsLoading: false,
      parentHasPendingTask: vi.fn(),
      selectedOutputId: 'output-1',
      onPairClick: vi.fn<(pairIndex: number) => void>(),
      handleOpenPairSettings: vi.fn<(pairIndex: number) => void>(),
      onSegmentFrameCountChange: vi.fn(),
      handleTrailingEndFrameChange: vi.fn(),
      setCallbackTrailingVideoUrl: vi.fn(),
      onFileDrop: vi.fn(),
      videoOutputs: [{ id: 'video-1' }],
      structureVideos: [],
      isStructureVideoLoading: false,
      cachedHasStructureVideo: false,
      onAddStructureVideo: vi.fn(),
      onUpdateStructureVideo: vi.fn(),
      onRemoveStructureVideo: vi.fn(),
      primaryStructureVideo: { path: null, treatment: 'adjust', motionStrength: 1, structureType: 'flow' },
      onPrimaryStructureVideoInputChange: vi.fn(),
      isUploadingStructureVideo: false,
      setIsUploadingStructureVideo: vi.fn(),
      audioUrl: null,
      audioMetadata: null,
      onAudioChange: vi.fn(),
      fullMin: 0,
      fullMax: 120,
      fullRange: 120,
      handleZoomInToCenter: vi.fn(),
      handleZoomOutFromCenter: vi.fn(),
      handleZoomReset: vi.fn(),
      handleZoomToStart: vi.fn(),
      dragState: { isDragging: false, activeId: null },
      dragType: null,
      dropTargetFrame: null,
      pendingDropFrame: null,
      pendingDuplicateFrame: null,
      pendingExternalAddFrame: null,
      isUploadingImage: false,
      isInternalDropProcessing: false,
      currentDragFrame: null,
      swapTargetId: null,
      endpointDragFrame: null,
      isEndpointDraggingState: false,
      handleEndpointMouseDown: vi.fn(),
      trailingVideoUrl: null,
      handleExtractFinalFrame: vi.fn(),
      framePositions: new Map([['img-1', 0]]),
      dragOffset: null,
      isMobile: false,
      isTablet: false,
      handleMouseDown: vi.fn(),
      handleDesktopDoubleClick: vi.fn(),
      handleMobileTap: vi.fn(),
      prefetchTaskData: vi.fn(),
      onImageDelete: vi.fn(),
      handleDuplicateInterceptor: vi.fn(),
      handleInpaintClick: vi.fn(),
      duplicatingImageId: null,
      duplicateSuccessImageId: null,
      isSelected: vi.fn().mockReturnValue(true),
      toggleSelection: vi.fn(),
      pairPrompts: { 0: { prompt: 'pair prompt', negativePrompt: 'pair negative' } },
      defaultPrompt: 'default prompt',
      defaultNegativePrompt: 'default negative',
      showPairLabels: true,
      onClearEnhancedPrompt: vi.fn(),
      currentPositions: new Map([['img-1', 0]]),
    };
  }

  it('maps container data into the prelude and layer components', () => {
    const data = buildData();
    render(<TimelineTrackContent data={data} />);

    expect(screen.getByTestId('timeline-track')).toBeInTheDocument();
    expect(captures.preludeProps).toMatchObject({
      timeline: expect.objectContaining({
        shotId: 'shot-1',
        selectedOutputId: 'output-1',
        pairInfoWithPending: [{ index: 0 }],
      }),
      layout: expect.objectContaining({
        fullMin: 0,
        fullRange: 120,
      }),
    });
    expect(captures.pairRegionsProps).toMatchObject({
      pairPrompts: { 0: { prompt: 'pair prompt', negativePrompt: 'pair negative' } },
      defaultPrompt: 'default prompt',
      selectedIdsCount: 1,
    });
    expect(captures.trailingProps).toMatchObject({
      trailingEndFrame: 81,
      onExtractFinalFrame: expect.any(Function),
    });
    expect(captures.itemsLayerProps).toMatchObject({
      drag: expect.objectContaining({
        isDragging: false,
        activeId: null,
      }),
      selection: expect.objectContaining({
        selectedCount: 1,
      }),
    });
  });

  it('either clears selection or tap-moves depending on the current interaction mode', () => {
    const data = buildData();
    render(<TimelineTrackContent data={data} />);

    const plainTarget = document.createElement('div');
    const plainEvent = {
      target: plainTarget,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 50,
    } as unknown as React.MouseEvent;

    act(() => {
      (captures.trackProps as { onContainerClick: (e: React.MouseEvent) => void }).onContainerClick(plainEvent);
    });

    expect(data.clearSelection).toHaveBeenCalledTimes(1);

    const tapData = {
      ...buildData(),
      enableTapToMove: true,
      selectedIds: ['img-1'],
      clearSelection: vi.fn(),
      handleTimelineTapToMove: vi.fn(),
    };
    render(<TimelineTrackContent data={tapData} />);

    const tapEvent = {
      target: document.createElement('div'),
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      clientX: 88,
    } as unknown as React.MouseEvent;

    act(() => {
      (captures.trackProps as { onContainerClick: (e: React.MouseEvent) => void }).onContainerClick(tapEvent);
    });

    expect(tapData.handleTimelineTapToMove).toHaveBeenCalledWith(88);
    expect(tapEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(tapData.clearSelection).not.toHaveBeenCalled();
  });
});
