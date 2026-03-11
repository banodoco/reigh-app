import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prefetchTaskData: vi.fn(),
  setResetGap: vi.fn(),
  handleImageDropInterceptor: vi.fn(),
  handleGenerationDropInterceptor: vi.fn(),
  handleDuplicateInterceptor: vi.fn(),
  handleTapToMoveAction: vi.fn(),
  handleTapToMoveMultiAction: vi.fn(),
  handleTimelineTapToMove: vi.fn(),
  handleVideoBrowserSelect: vi.fn(),
  handleMouseDown: vi.fn(),
  handleMouseMove: vi.fn(),
  handleMouseUp: vi.fn(),
  dynamicPositions: vi.fn(() => new Map([['img-1', 0], ['img-2', 50]])),
  handleEndpointMouseDown: vi.fn(),
  isSelected: vi.fn(() => false),
  toggleSelection: vi.fn(),
  clearSelection: vi.fn(),
}));

vi.mock('@/shared/hooks/mobile', () => ({
  useIsMobile: () => false,
  useIsTablet: () => true,
}));

vi.mock('@/shared/hooks/tasks/useTaskPrefetch', () => ({
  usePrefetchTaskData: () => mocks.prefetchTaskData,
}));

vi.mock('../../utils/timeline-utils', () => ({
  getTimelineDimensions: () => ({ fullMin: 0, fullMax: 80, fullRange: 80 }),
  getTrailingEffectiveEnd: () => 80,
  getPairInfo: vi.fn(() => ({ pairs: [] })),
}));

vi.mock('../drag/useTimelineDrag', () => ({
  useTimelineDrag: () => ({
    dragState: { isDragging: false, activeId: null },
    dragOffset: null,
    currentDragFrame: null,
    swapTargetId: null,
    pushMode: null,
    dynamicPositions: mocks.dynamicPositions,
    handleMouseDown: mocks.handleMouseDown,
    handleMouseMove: mocks.handleMouseMove,
    handleMouseUp: mocks.handleMouseUp,
  }),
}));

vi.mock('../useTimelineSelection', () => ({
  useTimelineSelection: () => ({
    selectedIds: ['img-1'],
    showSelectionBar: true,
    isSelected: mocks.isSelected,
    toggleSelection: mocks.toggleSelection,
    clearSelection: mocks.clearSelection,
    lockSelection: vi.fn(),
    unlockSelection: vi.fn(),
  }),
}));

vi.mock('../segment/usePendingFrames', () => ({
  usePendingFrames: () => ({
    pendingDropFrame: 12,
    setPendingDropFrame: vi.fn(),
    pendingDuplicateFrame: 18,
    setPendingDuplicateFrame: vi.fn(),
    pendingExternalAddFrame: null,
    isInternalDropProcessing: true,
    setIsInternalDropProcessing: vi.fn(),
    activePendingFrame: 12,
  }),
}));

vi.mock('./useComputedTimelineData', () => ({
  useComputedTimelineData: () => ({
    pairInfo: { pairs: [] },
    pairDataByIndex: new Map([[0, { index: 0 }]]),
    localShotGenPositions: new Map([['img-1', 0]]),
    showPairLabels: true,
  }),
}));

vi.mock('./useTimelineUiState', () => ({
  useTimelineUiState: () => ({
    resetGap: 12,
    setResetGap: mocks.setResetGap,
    maxGap: 6,
    showVideoBrowser: false,
    setShowVideoBrowser: vi.fn(),
    isUploadingStructureVideo: false,
    setIsUploadingStructureVideo: vi.fn(),
  }),
}));

vi.mock('../drag/useEndpointDrag', () => ({
  useEndpointDrag: () => ({
    endpointDragFrame: 77,
    isEndpointDragging: false,
    handleEndpointMouseDown: mocks.handleEndpointMouseDown,
  }),
}));

vi.mock('./useTimelineViewportController', () => ({
  useTimelineViewportController: () => ({
    fullMin: 0,
    fullMax: 80,
    fullRange: 80,
    containerWidth: 640,
    zoomLevel: 1.5,
    handleZoomInToCenter: vi.fn(),
    handleZoomOutFromCenter: vi.fn(),
    handleZoomReset: vi.fn(),
    handleZoomToStart: vi.fn(),
    handleTimelineDoubleClick: vi.fn(),
    dragStartDimensionsRef: { current: null },
  }),
}));

vi.mock('../drag/useUnifiedDrop', () => ({
  useUnifiedDrop: () => ({
    isFileOver: false,
    dropTargetFrame: null,
    dragType: 'none',
    handleDragEnter: vi.fn(),
    handleDragOver: vi.fn(),
    handleDragLeave: vi.fn(),
    handleDrop: vi.fn(),
  }),
}));

vi.mock('./useTimelineOrchestratorActions', () => ({
  useTimelineOrchestratorActions: vi.fn((args: unknown) => {
    (globalThis as { __timelineActionArgs__?: unknown }).__timelineActionArgs__ = args;
    return {
      handleImageDropInterceptor: mocks.handleImageDropInterceptor,
      handleGenerationDropInterceptor: mocks.handleGenerationDropInterceptor,
      handleDuplicateInterceptor: mocks.handleDuplicateInterceptor,
      handleTapToMoveAction: mocks.handleTapToMoveAction,
      handleTapToMoveMultiAction: mocks.handleTapToMoveMultiAction,
      handleTimelineTapToMove: mocks.handleTimelineTapToMove,
      handleVideoBrowserSelect: mocks.handleVideoBrowserSelect,
    };
  }),
  handleTimelineStructureVideoSelect: vi.fn(),
  runDuplicateInterceptor: vi.fn(),
  runGenerationDropInterceptor: vi.fn(),
  runImageDropInterceptor: vi.fn(),
}));

import { useTimelineOrchestrator } from './useTimelineOrchestrator';

describe('useTimelineOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as { __timelineActionArgs__?: unknown }).__timelineActionArgs__;
  });

  it('composes timeline state and clamps reset gap through the returned model', () => {
    const { result } = renderHook(() => useTimelineOrchestrator({
      shotId: 'shot-1',
      images: [
        { id: 'img-1', timeline_frame: 0 },
        { id: 'img-2', timeline_frame: 50 },
      ] as never,
      framePositions: new Map([['img-1', 0], ['img-2', 50]]),
      setFramePositions: vi.fn().mockResolvedValue(undefined),
      onImageReorder: vi.fn(),
      setIsDragInProgress: vi.fn(),
      onImageDuplicate: vi.fn(),
      structureVideo: {
        structureVideos: [{ path: 'guide.mp4', start_frame: 0, end_frame: 40, treatment: 'adjust' }],
        primaryStructureVideo: {
          path: 'guide.mp4',
          metadata: null,
          treatment: 'adjust',
          motionStrength: 1,
          structureType: 'flow',
          uni3cEndPercent: 0.1,
        },
      },
    }));

    expect(mocks.setResetGap).toHaveBeenCalledWith(6);
    expect(result.current.selection.selectedIds).toEqual(['img-1']);
    expect(result.current.pending.pendingDropFrame).toBe(12);
    expect(result.current.endpoint.endpointDragFrame).toBe(77);
    expect(result.current.device.enableTapToMove).toBe(true);
    expect(result.current.actions.handleVideoBrowserSelect).toBe(mocks.handleVideoBrowserSelect);
    expect(result.current.actions.handleEndpointMouseDown).toBe(mocks.handleEndpointMouseDown);
    expect(result.current.computed.currentPositions).toEqual(new Map([['img-1', 0], ['img-2', 50]]));

    expect((globalThis as { __timelineActionArgs__?: Record<string, unknown> }).__timelineActionArgs__).toEqual(
      expect.objectContaining({
        enableTapToMove: true,
        fullMax: 80,
        containerWidth: 640,
        selectedIds: ['img-1'],
      }),
    );
  });
});
