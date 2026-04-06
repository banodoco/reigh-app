// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimelineCanvas } from '@/tools/video-editor/components/TimelineEditor/TimelineCanvas';
import type { TrackDefinition } from '@/tools/video-editor/types';
import type { TimelineAction, TimelineRow } from '@/tools/video-editor/types/timeline-canvas';

const useTimelineEditorDataMock = vi.fn();

vi.mock('@/tools/video-editor/contexts/TimelineEditorContext', async () => {
  const actual = await vi.importActual<typeof import('@/tools/video-editor/contexts/TimelineEditorContext')>(
    '@/tools/video-editor/contexts/TimelineEditorContext',
  );

  return {
    ...actual,
    useTimelineEditorData: () => useTimelineEditorDataMock(),
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
  dataRef?: { current: any };
  onActionResizeStart?: ReturnType<typeof vi.fn>;
  onActionResizeEnd?: ReturnType<typeof vi.fn>;
  getActionRender?: ReturnType<typeof vi.fn>;
  track?: TrackDefinition;
  row?: TimelineRow;
  shotGroups?: React.ComponentProps<typeof TimelineCanvas>['shotGroups'];
  finalVideoMap?: React.ComponentProps<typeof TimelineCanvas>['finalVideoMap'];
  onShotGroupUnpin?: React.ComponentProps<typeof TimelineCanvas>['onShotGroupUnpin'];
  onShotGroupSwitchToFinalVideo?: React.ComponentProps<typeof TimelineCanvas>['onShotGroupSwitchToFinalVideo'];
  onShotGroupSwitchToImages?: React.ComponentProps<typeof TimelineCanvas>['onShotGroupSwitchToImages'];
}) {
  const pendingOpsRef = params?.pendingOpsRef ?? { current: 0 };
  const dataRef = params?.dataRef ?? { current: null };
  const trackDefinition = params?.track ?? track;
  const timelineRow = params?.row ?? row;
  useTimelineEditorDataMock.mockReturnValue({ pendingOpsRef, dataRef });

  const onActionResizeStart = params?.onActionResizeStart ?? vi.fn();
  const onActionResizeEnd = params?.onActionResizeEnd ?? vi.fn();
  const getActionRender = params?.getActionRender ?? vi.fn(() => <div>clip</div>);

  const renderResult = render(
    <TimelineCanvas
      rows={[timelineRow]}
      tracks={[trackDefinition]}
      scale={1}
      scaleWidth={100}
      scaleSplitCount={1}
      startLeft={0}
      rowHeight={48}
      minScaleCount={1}
      maxScaleCount={10}
      selectedTrackId={null}
      getActionRender={getActionRender}
      onSelectTrack={vi.fn()}
      onTrackChange={vi.fn()}
      onRemoveTrack={vi.fn()}
      onTrackDragEnd={vi.fn()}
      trackSensors={[] as never}
      onCursorDrag={vi.fn()}
      onClickTimeArea={vi.fn()}
      onActionResizeStart={onActionResizeStart}
      onActionResizeEnd={onActionResizeEnd}
      shotGroups={params?.shotGroups}
      finalVideoMap={params?.finalVideoMap}
      onShotGroupUnpin={params?.onShotGroupUnpin}
      onShotGroupSwitchToFinalVideo={params?.onShotGroupSwitchToFinalVideo}
      onShotGroupSwitchToImages={params?.onShotGroupSwitchToImages}
      dragSessionRef={{ current: null }}
    />,
  );

  const actionElement = renderResult.container.querySelector(`[data-action-id="${timelineRow.actions[0]?.id ?? 'clip-1'}"]`);
  if (!(actionElement instanceof HTMLElement)) {
    throw new Error('expected action element');
  }

  const handles = actionElement.querySelectorAll('.cursor-ew-resize');
  const leftHandle = handles[0];
  const rightHandle = handles[1];
  if (!(leftHandle instanceof HTMLElement) || !(rightHandle instanceof HTMLElement)) {
    throw new Error('expected resize handles');
  }

  return {
    ...renderResult,
    actionElement,
    leftHandle,
    rightHandle,
    pendingOpsRef,
    onActionResizeStart,
    onActionResizeEnd,
    getActionRender,
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
  useTimelineEditorDataMock.mockReset();
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

  it('passes the rendered clip width into getActionRender', () => {
    const getActionRender = vi.fn(() => <div>clip</div>);
    renderCanvas({ getActionRender });

    expect(getActionRender).toHaveBeenCalledWith(action, row, 200);
  });

  it('clamps right-edge audio resize preview to the source duration and clears the ring on resize end', () => {
    const audioTrack: TrackDefinition = { id: 'A1', kind: 'audio', label: 'A1' };
    const audioAction: TimelineAction = { id: 'clip-1', start: 0, end: 2, effectId: 'effect-clip-1' };
    const audioRow: TimelineRow = { id: 'A1', actions: [audioAction] };
    const dataRef = {
      current: {
        meta: {
          'clip-1': { track: 'A1', clipType: 'media', asset: 'asset-1', from: 1, speed: 1 },
        },
        tracks: [audioTrack],
        resolvedConfig: {
          registry: {
            'asset-1': { duration: 3.5 },
          },
        },
        registry: {
          assets: {
            'asset-1': { duration: 3.5 },
          },
        },
      },
    };
    const { actionElement, rightHandle, onActionResizeEnd } = renderCanvas({
      track: audioTrack,
      row: audioRow,
      dataRef,
    });

    fireEvent.pointerDown(rightHandle, {
      button: 0,
      pointerId: 9,
      clientX: 200,
    });

    fireEvent.pointerMove(rightHandle, {
      pointerId: 9,
      clientX: 400,
    });

    expect(actionElement.className).toContain('ring-amber-400/80');

    fireEvent.pointerUp(rightHandle, {
      pointerId: 9,
      clientX: 400,
    });

    expect(onActionResizeEnd).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({ start: 0, end: 2.5 }),
      dir: 'right',
      row: audioRow,
    }));
    expect(actionElement.className).not.toContain('ring-amber-400/80');
  });

  it('clamps left-edge audio resize preview before source time zero', () => {
    const audioTrack: TrackDefinition = { id: 'A1', kind: 'audio', label: 'A1' };
    const audioAction: TimelineAction = { id: 'clip-1', start: 2, end: 4, effectId: 'effect-clip-1' };
    const audioRow: TimelineRow = { id: 'A1', actions: [audioAction] };
    const dataRef = {
      current: {
        meta: {
          'clip-1': { track: 'A1', clipType: 'media', asset: 'asset-1', from: 1, speed: 1 },
        },
        tracks: [audioTrack],
        resolvedConfig: {
          registry: {
            'asset-1': { duration: 5 },
          },
        },
        registry: {
          assets: {
            'asset-1': { duration: 5 },
          },
        },
      },
    };
    const { actionElement, leftHandle, onActionResizeEnd } = renderCanvas({
      track: audioTrack,
      row: audioRow,
      dataRef,
    });

    fireEvent.pointerDown(leftHandle, {
      button: 0,
      pointerId: 10,
      clientX: 200,
    });

    fireEvent.pointerMove(leftHandle, {
      pointerId: 10,
      clientX: -100,
    });

    expect(actionElement.className).toContain('ring-amber-400/80');

    fireEvent.pointerUp(leftHandle, {
      pointerId: 10,
      clientX: -100,
    });

    expect(onActionResizeEnd).toHaveBeenCalledWith(expect.objectContaining({
      action: expect.objectContaining({ start: 1, end: 4 }),
      dir: 'left',
      row: audioRow,
    }));
    expect(actionElement.className).not.toContain('ring-amber-400/80');
  });

  it('renders all shot groups with solid borders and always shows the shot name label', () => {
    const { container, getByText } = renderCanvas({
      shotGroups: [
        {
          shotId: 'shot-a',
          shotName: 'Shot A',
          rowId: 'V1',
          rowIndex: 0,
          clipIds: ['clip-1'],
          color: '#3b82f6',
        },
        {
          shotId: 'shot-b',
          shotName: 'Shot B',
          rowId: 'V1',
          rowIndex: 0,
          clipIds: ['clip-1'],
          color: '#22c55e',
          mode: 'images',
        },
      ],
    });

    expect(container.innerHTML).not.toContain('border-dashed');
    expect(container.innerHTML).toContain('border-solid');
    expect(container.querySelectorAll('[data-shot-group-kind="pinned"]')).toHaveLength(2);
    expect(getByText('Shot A')).toBeTruthy();
    expect(getByText('Shot B')).toBeTruthy();
  });

  it('shows unpin and switch-to-video actions for pinned groups with a final video', () => {
    const onShotGroupSwitchToFinalVideo = vi.fn();
    const onShotGroupUnpin = vi.fn();
    const { getByTitle } = renderCanvas({
      shotGroups: [{
        shotId: 'shot-1',
        shotName: 'Pinned Shot',
        rowId: 'V1',
        rowIndex: 0,
        clipIds: ['clip-1'],
        color: '#22c55e',
        mode: 'images',
      }],
      finalVideoMap: new Map([['shot-1', {}]]),
      onShotGroupUnpin,
      onShotGroupSwitchToFinalVideo,
    });

    fireEvent.contextMenu(getByTitle('Pinned Shot'));

    expect(screen.getByText('Unpin')).toBeTruthy();
    expect(screen.getByText('Switch to Final Video')).toBeTruthy();
    expect(screen.queryByText('Pin as Shot Group')).toBeNull();
    expect(screen.queryByText('Switch to Images')).toBeNull();

    fireEvent.click(screen.getByText('Switch to Final Video'));

    expect(onShotGroupSwitchToFinalVideo).toHaveBeenCalledWith({
      shotId: 'shot-1',
      clipIds: ['clip-1'],
      rowId: 'V1',
    });
  });

  it('shows unpin and switch-to-images actions for pinned video groups', () => {
    const onShotGroupUnpin = vi.fn();
    const onShotGroupSwitchToImages = vi.fn();
    const { getByTitle } = renderCanvas({
      shotGroups: [{
        shotId: 'shot-1',
        shotName: 'Pinned Shot',
        rowId: 'V1',
        rowIndex: 0,
        clipIds: ['clip-1'],
        color: '#3b82f6',
        mode: 'video',
      }],
      finalVideoMap: new Map([['shot-1', {}]]),
      onShotGroupUnpin,
      onShotGroupSwitchToImages,
    });

    fireEvent.contextMenu(getByTitle('Pinned Shot'));

    expect(screen.getByText('Unpin')).toBeTruthy();
    expect(screen.getByText('Switch to Images')).toBeTruthy();
    expect(screen.queryByText('Pin as Shot Group')).toBeNull();
    expect(screen.queryByText('Switch to Final Video')).toBeNull();

    fireEvent.click(screen.getByText('Switch to Images'));
    expect(onShotGroupSwitchToImages).toHaveBeenCalledWith({ shotId: 'shot-1', rowId: 'V1' });

    fireEvent.contextMenu(getByTitle('Pinned Shot'));
    fireEvent.click(screen.getByText('Unpin'));
    expect(onShotGroupUnpin).toHaveBeenCalledWith({ shotId: 'shot-1', trackId: 'V1' });
  });
});
