import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useTimelineViewportController } from './useTimelineViewportController';

const mocks = vi.hoisted(() => ({
  getTimelineDimensions: vi.fn(() => ({ fullMin: 0, fullMax: 200, fullRange: 200 })),
  getTrailingEffectiveEnd: vi.fn(() => 120),
  useGlobalEvents: vi.fn(),
  handleZoomIn: vi.fn(),
  handleZoomOut: vi.fn(),
  handleZoomReset: vi.fn(),
  handleZoomToStart: vi.fn(),
  handleTimelineDoubleClick: vi.fn(),
  zoomState: {
    zoomLevel: 1,
    zoomCenter: 50,
    isZooming: false,
  },
}));

vi.mock('../../utils/timeline-utils', () => ({
  getTimelineDimensions: (...args: unknown[]) => mocks.getTimelineDimensions(...args),
  getTrailingEffectiveEnd: (...args: unknown[]) => mocks.getTrailingEffectiveEnd(...args),
}));

vi.mock('../useGlobalEvents', () => ({
  useGlobalEvents: (...args: unknown[]) => mocks.useGlobalEvents(...args),
}));

vi.mock('../useZoom', () => ({
  useZoom: () => ({
    zoomLevel: mocks.zoomState.zoomLevel,
    zoomCenter: mocks.zoomState.zoomCenter,
    handleZoomIn: mocks.handleZoomIn,
    handleZoomOut: mocks.handleZoomOut,
    handleZoomReset: mocks.handleZoomReset,
    handleZoomToStart: mocks.handleZoomToStart,
    handleTimelineDoubleClick: mocks.handleTimelineDoubleClick,
    isZooming: mocks.zoomState.isZooming,
  }),
}));

describe('useTimelineViewportController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.zoomState.zoomLevel = 1;
    mocks.zoomState.zoomCenter = 50;
    mocks.zoomState.isZooming = false;
  });

  function buildInput(overrides: Record<string, unknown> = {}) {
    return {
      framePositions: new Map([['a', 0], ['b', 100]]),
      pendingDropFrame: null,
      pendingDuplicateFrame: null,
      pendingExternalAddFrame: null,
      imagesCount: 2,
      hasExistingTrailingVideo: false,
      timelineRef: { current: { scrollLeft: 100, clientWidth: 400, scrollTo: vi.fn() } },
      containerRef: { current: { clientWidth: 800, scrollWidth: 1000 } },
      isEndpointDraggingRef: { current: false },
      dragState: { isDragging: false, activeId: 'active' },
      shotId: 'shot-1',
      handleMouseMove: vi.fn(),
      handleMouseUp: vi.fn(),
      ...overrides,
    } as never;
  }

  it('zooms in/out around viewport center when refs are available', () => {
    const { result } = renderHook(() =>
      useTimelineViewportController(buildInput()),
    );

    act(() => {
      result.current.handleZoomInToCenter();
      result.current.handleZoomOutFromCenter();
    });

    expect(mocks.handleZoomIn).toHaveBeenCalledWith(60);
    expect(mocks.handleZoomOut).toHaveBeenCalledWith(60);
    expect(result.current.containerWidth).toBe(800);
  });

  it('falls back to fullMin zoom target when timeline refs are unavailable', () => {
    const { result } = renderHook(() =>
      useTimelineViewportController(
        buildInput({
          timelineRef: { current: null },
          containerRef: { current: null },
        }),
      ),
    );

    act(() => {
      result.current.handleZoomInToCenter();
      result.current.handleZoomOutFromCenter();
    });

    expect(mocks.handleZoomIn).toHaveBeenCalledWith(0);
    expect(mocks.handleZoomOut).toHaveBeenCalledWith(0);
    expect(result.current.containerWidth).toBe(1000);
  });

  it('recenters scroll position after zoom completes', () => {
    vi.useFakeTimers();
    mocks.zoomState.zoomLevel = 2;
    mocks.zoomState.zoomCenter = 75;
    mocks.zoomState.isZooming = true;
    const timelineRef = { current: { scrollLeft: 0, clientWidth: 200, scrollTo: vi.fn() } };
    const containerRef = { current: { clientWidth: 800, scrollWidth: 1000 } };

    renderHook(() =>
      useTimelineViewportController(
        buildInput({
          timelineRef,
          containerRef,
          dragState: { isDragging: false, activeId: 'keep' },
        }),
      ),
    );

    act(() => {
      vi.advanceTimersByTime(11);
    });

    expect(timelineRef.current.scrollTo).toHaveBeenCalledWith({
      left: 275,
      behavior: 'instant',
    });
    vi.useRealTimers();
  });
});
