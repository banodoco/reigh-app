// @vitest-environment jsdom
import { act, fireEvent, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useClipDrag } from '@/tools/video-editor/hooks/useClipDrag';
import type { DragCoordinator } from '@/tools/video-editor/hooks/useDragCoordinator';
import type { TimelineData } from '@/tools/video-editor/lib/timeline-data';
import type { TrackDefinition } from '@/tools/video-editor/types';

const makeTrack = (id: string): TrackDefinition => ({
  id,
  kind: 'visual',
  label: id,
  scale: 1,
  fit: 'manual',
  opacity: 1,
  blendMode: 'normal',
});

function makeCoordinator(overrides: Partial<ReturnType<DragCoordinator['update']>> = {}): DragCoordinator {
  const defaultPosition = {
    time: 0,
    rowIndex: 0,
    trackId: 'V1',
    trackKind: 'visual' as const,
    trackName: 'V1',
    isNewTrack: false,
    isNewTrackTop: false,
    isReject: false,
    newTrackKind: null,
    screenCoords: {
      rowTop: 0,
      rowLeft: 0,
      rowWidth: 0,
      rowHeight: 48,
      clipLeft: 0,
      clipWidth: 0,
      ghostCenter: 0,
    },
  };
  const coordinator = {
    update: vi.fn(() => {
      const nextPosition = {
        ...defaultPosition,
        ...overrides,
        screenCoords: {
          ...defaultPosition.screenCoords,
          ...overrides.screenCoords,
        },
      };
      coordinator.lastPosition = nextPosition;
      return nextPosition;
    }),
    showSecondaryGhosts: vi.fn(),
    end: vi.fn(),
    lastPosition: null,
    editAreaRef: { current: null },
  } satisfies DragCoordinator;

  return coordinator;
}

function makeData(): TimelineData {
  const baseTrack = makeTrack('V1');
  return {
    config: {
      output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
      tracks: [baseTrack],
      clips: [{ id: 'clip-1', at: 0, track: 'V1', clipType: 'hold', hold: 2 }],
    },
    configVersion: 1,
    registry: { assets: {} },
    resolvedConfig: {
      output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
      tracks: [baseTrack],
      clips: [{ id: 'clip-1', at: 0, track: 'V1', clipType: 'hold', hold: 2 }],
      registry: {},
    },
    rows: [{
      id: 'V1',
      actions: [{ id: 'clip-1', start: 0, end: 2, effectId: 'effect-clip-1' }],
    }],
    meta: {
      'clip-1': {
        track: 'V1',
        clipType: 'hold',
        hold: 2,
      },
    },
    effects: {
      'effect-clip-1': { id: 'effect-clip-1' },
    },
    assetMap: {},
    output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
    tracks: [baseTrack],
    clipOrder: { V1: ['clip-1'] },
    signature: 'sig-1',
    stableSignature: 'stable-1',
  };
}

function makeMultiClipData(): TimelineData {
  const tracks = [makeTrack('V1'), makeTrack('V2')];
  return {
    config: {
      output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
      tracks,
      clips: [
        { id: 'clip-1', at: 0, track: 'V1', clipType: 'hold', hold: 2 },
        { id: 'clip-2', at: 2, track: 'V2', clipType: 'hold', hold: 2 },
      ],
    },
    configVersion: 1,
    registry: { assets: {} },
    resolvedConfig: {
      output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
      tracks,
      clips: [
        { id: 'clip-1', at: 0, track: 'V1', clipType: 'hold', hold: 2 },
        { id: 'clip-2', at: 2, track: 'V2', clipType: 'hold', hold: 2 },
      ],
      registry: {},
    },
    rows: [
      { id: 'V1', actions: [{ id: 'clip-1', start: 0, end: 2, effectId: 'effect-clip-1' }] },
      { id: 'V2', actions: [{ id: 'clip-2', start: 2, end: 4, effectId: 'effect-clip-2' }] },
    ],
    meta: {
      'clip-1': { track: 'V1', clipType: 'hold', hold: 2 },
      'clip-2': { track: 'V2', clipType: 'hold', hold: 2 },
    },
    effects: {
      'effect-clip-1': { id: 'effect-clip-1' },
      'effect-clip-2': { id: 'effect-clip-2' },
    },
    assetMap: {},
    output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
    tracks,
    clipOrder: { V1: ['clip-1'], V2: ['clip-2'] },
    signature: 'sig-1',
    stableSignature: 'stable-1',
  };
}

function setupDom(clipId = 'clip-1', rowId = 'V1') {
  const wrapper = document.createElement('div');
  wrapper.className = 'timeline-wrapper';
  const editArea = document.createElement('div');
  editArea.className = 'timeline-canvas-edit-area';
  const clip = document.createElement('div');
  clip.className = 'clip-action';
  clip.dataset.clipId = clipId;
  clip.dataset.rowId = rowId;
  clip.getBoundingClientRect = () => ({
    x: 0,
    y: rowId === 'V2' ? 48 : 0,
    left: 0,
    top: rowId === 'V2' ? 48 : 0,
    right: 120,
    bottom: rowId === 'V2' ? 72 : 24,
    width: 120,
    height: 24,
    toJSON: () => ({}),
  });
  editArea.appendChild(clip);
  wrapper.appendChild(editArea);
  document.body.appendChild(wrapper);

  return {
    clip,
    wrapper,
    cleanup: () => wrapper.remove(),
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('useClipDrag', () => {
  it('increments on pointerdown and returns pendingOpsRef to 0 on pointerup', () => {
    const pendingOpsRef = { current: 0 };
    const { clip, wrapper, cleanup } = setupDom();
    const timelineWrapperRef = { current: wrapper };
    const dataRef = { current: makeData() };

    try {
      renderHook(() => useClipDrag({
        timelineWrapperRef,
        dataRef,
        pendingOpsRef,
        moveClipToRow: vi.fn(),
        createTrackAndMoveClip: vi.fn(),
        selectClip: vi.fn(),
        selectClips: vi.fn(),
        selectedClipIdsRef: { current: new Set<string>() },
        applyEdit: vi.fn(),
        coordinator: makeCoordinator(),
        rowHeight: 48,
        scale: 1,
        scaleWidth: 100,
        startLeft: 0,
      }));

      act(() => {
        fireEvent.pointerDown(clip, {
          button: 0,
          pointerId: 1,
          clientX: 24,
          clientY: 12,
        });
      });
      expect(pendingOpsRef.current).toBe(1);

      act(() => {
        fireEvent.pointerUp(window, {
          pointerId: 1,
          clientX: 24,
          clientY: 12,
        });
      });
      expect(pendingOpsRef.current).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('returns pendingOpsRef to 0 on pointercancel', () => {
    const pendingOpsRef = { current: 0 };
    const { clip, wrapper, cleanup } = setupDom();
    const timelineWrapperRef = { current: wrapper };
    const dataRef = { current: makeData() };

    try {
      renderHook(() => useClipDrag({
        timelineWrapperRef,
        dataRef,
        pendingOpsRef,
        moveClipToRow: vi.fn(),
        createTrackAndMoveClip: vi.fn(),
        selectClip: vi.fn(),
        selectClips: vi.fn(),
        selectedClipIdsRef: { current: new Set<string>() },
        applyEdit: vi.fn(),
        coordinator: makeCoordinator(),
        rowHeight: 48,
        scale: 1,
        scaleWidth: 100,
        startLeft: 0,
      }));

      act(() => {
        fireEvent.pointerDown(clip, {
          button: 0,
          pointerId: 2,
          clientX: 24,
          clientY: 12,
        });
      });
      expect(pendingOpsRef.current).toBe(1);

      act(() => {
        fireEvent.pointerCancel(window, {
          pointerId: 2,
          clientX: 24,
          clientY: 12,
        });
      });
      expect(pendingOpsRef.current).toBe(0);
    } finally {
      cleanup();
    }
  });

  it('commits a config edit when a multi-clip drag drops onto a new bottom track', () => {
    const pendingOpsRef = { current: 0 };
    const applyEdit = vi.fn();
    const selectClips = vi.fn();
    const coordinator = makeCoordinator({
      time: 3,
      rowIndex: 2,
      trackId: undefined,
      trackName: '',
      isNewTrack: true,
      isNewTrackTop: false,
      newTrackKind: 'visual',
      screenCoords: {
        rowTop: 96,
        rowLeft: 0,
        rowWidth: 400,
        rowHeight: 48,
        clipLeft: 300,
        clipWidth: 120,
        ghostCenter: 360,
      },
    });
    const { clip, wrapper, cleanup } = setupDom('clip-2', 'V2');
    const timelineWrapperRef = { current: wrapper };
    const dataRef = { current: makeMultiClipData() };

    try {
      renderHook(() => useClipDrag({
        timelineWrapperRef,
        dataRef,
        pendingOpsRef,
        moveClipToRow: vi.fn(),
        createTrackAndMoveClip: vi.fn(),
        selectClip: vi.fn(),
        selectClips,
        selectedClipIdsRef: { current: new Set<string>(['clip-1', 'clip-2']) },
        applyEdit,
        coordinator,
        rowHeight: 48,
        scale: 1,
        scaleWidth: 100,
        startLeft: 0,
      }));

      act(() => {
        fireEvent.pointerDown(clip, {
          button: 0,
          pointerId: 3,
          clientX: 24,
          clientY: 60,
        });
      });

      act(() => {
        fireEvent.pointerMove(window, {
          pointerId: 3,
          clientX: 124,
          clientY: 80,
        });
      });

      act(() => {
        fireEvent.pointerUp(window, {
          pointerId: 3,
          clientX: 124,
          clientY: 80,
        });
      });

      expect(applyEdit).toHaveBeenCalledTimes(1);
      const [edit, options] = applyEdit.mock.calls[0];
      expect(edit.type).toBe('config');
      expect(options).toMatchObject({ transactionId: expect.any(String) });
      expect(edit.resolvedConfig.tracks.map((track: TrackDefinition) => track.id)).toEqual(['V1', 'V2', 'V3']);
      expect(edit.resolvedConfig.clips).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'clip-1', track: 'V2', at: 1, hold: 2 }),
        expect.objectContaining({ id: 'clip-2', track: 'V3', at: 3, hold: 2 }),
      ]));
      expect(selectClips).toHaveBeenCalledWith(['clip-2', 'clip-1']);
      expect(coordinator.showSecondaryGhosts).toHaveBeenCalled();
      expect(pendingOpsRef.current).toBe(0);
    } finally {
      cleanup();
    }
  });
});
