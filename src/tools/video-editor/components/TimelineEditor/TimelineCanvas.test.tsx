// @vitest-environment jsdom
import { fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineCanvas } from '@/tools/video-editor/components/TimelineEditor/TimelineCanvas';
import type { TrackDefinition } from '@/tools/video-editor/types';
import type { TimelineAction, TimelineRow } from '@/tools/video-editor/types/timeline-canvas';

const useTimelineEditorContextMock = vi.fn();

vi.mock('@/tools/video-editor/contexts/TimelineEditorContext', async () => {
  const actual = await vi.importActual<typeof import('@/tools/video-editor/contexts/TimelineEditorContext')>(
    '@/tools/video-editor/contexts/TimelineEditorContext',
  );

  return {
    ...actual,
    useTimelineEditorContext: () => useTimelineEditorContextMock(),
  };
});

let pointerCaptures = new WeakMap<HTMLElement, Set<number>>();

function getPointerCaptures(element: HTMLElement) {
  let captures = pointerCaptures.get(element);
  if (!captures) {
    captures = new Set<number>();
    pointerCaptures.set(element, captures);
  }

  return captures;
}

const track: TrackDefinition = { id: 'V1', kind: 'visual', label: 'V1' };
const action: TimelineAction = { id: 'clip-1', start: 0, end: 2, effectId: 'effect-clip-1' };
const row: TimelineRow = { id: 'V1', actions: [action] };

function renderCanvas(params?: {
  pendingOpsRef?: React.MutableRefObject<number>;
  onActionResizeStart?: ReturnType<typeof vi.fn>;
  onActionResizeEnd?: ReturnType<typeof vi.fn>;
}) {
  const pendingOpsRef = params?.pendingOpsRef ?? { current: 0 };
  useTimelineEditorContextMock.mockReturnValue({ pendingOpsRef });

  const onActionResizeStart = params?.onActionResizeStart ?? vi.fn();
  const onActionResizeEnd = params?.onActionResizeEnd ?? vi.fn();

  const renderResult = render(
    <TimelineCanvas
      rows={[row]}
      tracks={[track]}
      scale={1}
      scaleWidth={100}
      scaleSplitCount={1}
      startLeft={0}
      rowHeight={48}
      minScaleCount={1}
      maxScaleCount={10}
      selectedTrackId={null}
      getActionRender={() => <div>clip</div>}
      onSelectTrack={vi.fn()}
      onTrackChange={vi.fn()}
      onRemoveTrack={vi.fn()}
      onTrackDragEnd={vi.fn()}
      trackSensors={[] as never}
      onCursorDrag={vi.fn()}
      onClickTimeArea={vi.fn()}
      onActionResizeStart={onActionResizeStart}
      onActionResizeEnd={onActionResizeEnd}
    />,
  );

  const leftHandle = renderResult.container.querySelector('[data-action-id="clip-1"] .cursor-ew-resize');
  if (!(leftHandle instanceof HTMLElement)) {
    throw new Error('expected resize handle');
  }

  return {
    ...renderResult,
    leftHandle,
    pendingOpsRef,
    onActionResizeStart,
    onActionResizeEnd,
  };
}

beforeEach(() => {
  Object.defineProperties(HTMLElement.prototype, {
    setPointerCapture: {
      configurable: true,
      value(pointerId: number) {
        getPointerCaptures(this).add(pointerId);
      },
    },
    releasePointerCapture: {
      configurable: true,
      value(pointerId: number) {
        getPointerCaptures(this).delete(pointerId);
      },
    },
    hasPointerCapture: {
      configurable: true,
      value(pointerId: number) {
        return getPointerCaptures(this).has(pointerId);
      },
    },
  });
});

afterEach(() => {
  useTimelineEditorContextMock.mockReset();
  pointerCaptures = new WeakMap<HTMLElement, Set<number>>();
});

describe('TimelineCanvas resize pending ops', () => {
  it('increments on resize start and decrements on resize end', () => {
    const { leftHandle, pendingOpsRef, onActionResizeStart, onActionResizeEnd } = renderCanvas();

    fireEvent.pointerDown(leftHandle, {
      button: 0,
      pointerId: 7,
      clientX: 120,
    });

    expect(pendingOpsRef.current).toBe(1);
    expect(onActionResizeStart).toHaveBeenCalledTimes(1);

    fireEvent.pointerUp(leftHandle, {
      pointerId: 7,
      clientX: 120,
    });

    expect(pendingOpsRef.current).toBe(0);
    expect(onActionResizeEnd).toHaveBeenCalledTimes(1);
  });

  it('decrements on pointercancel without firing resize end', () => {
    const { leftHandle, pendingOpsRef, onActionResizeEnd } = renderCanvas();

    fireEvent.pointerDown(leftHandle, {
      button: 0,
      pointerId: 8,
      clientX: 120,
    });

    expect(pendingOpsRef.current).toBe(1);

    fireEvent.pointerCancel(leftHandle, {
      pointerId: 8,
      clientX: 120,
    });

    expect(pendingOpsRef.current).toBe(0);
    expect(onActionResizeEnd).not.toHaveBeenCalled();
  });
});
