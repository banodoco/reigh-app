import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { patchAffectsDuration, recalcActionEnd, useClipEditing } from '@/tools/video-editor/hooks/useClipEditing';
import type { ClipMeta, TimelineData } from '@/tools/video-editor/lib/timeline-data';
import type { TimelineRow } from '@/tools/video-editor/types/timeline-canvas';

const makeTimelineData = (overrides?: {
  rows?: TimelineRow[];
  meta?: Record<string, ClipMeta>;
}): TimelineData => ({
  config: { output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' }, clips: [] },
  configVersion: 1,
  registry: { assets: {} },
  resolvedConfig: { output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' }, tracks: [], clips: [], registry: {} },
  rows: overrides?.rows ?? [],
  meta: overrides?.meta ?? {},
  effects: {},
  assetMap: {},
  output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' },
  tracks: [],
  clipOrder: {},
  signature: 'signature',
  stableSignature: 'stable-signature',
});

describe('useClipEditing duration recalculation', () => {
  it('recalcActionEnd handles speed, from, to, and hold patches', () => {
    const action = { id: 'clip-1', start: 5, end: 9, effectId: 'effect-clip-1' };

    expect(recalcActionEnd(action, { from: 0, to: 4, speed: 2 })).toBe(7);
    expect(recalcActionEnd(action, { from: 1, to: 4, speed: 1 })).toBe(8);
    expect(recalcActionEnd(action, { from: 0, to: 3, speed: 1 })).toBe(8);
    expect(recalcActionEnd(action, { from: 0, to: 3, speed: 2, hold: 10 })).toBe(10);
  });

  it('patchAffectsDuration only flags duration keys', () => {
    expect(patchAffectsDuration({ speed: 2 })).toBe(true);
    expect(patchAffectsDuration({ from: 1 })).toBe(true);
    expect(patchAffectsDuration({ to: 3 })).toBe(true);
    expect(patchAffectsDuration({ hold: 10 })).toBe(true);
    expect(patchAffectsDuration({ x: 20 })).toBe(false);
    expect(patchAffectsDuration({ opacity: 0.5 })).toBe(false);
  });

  it('recalculates action.end for single-clip duration edits', () => {
    const applyTimelineEdit = vi.fn();
    const dataRef = {
      current: makeTimelineData({
        rows: [{ id: 'V1', actions: [{ id: 'clip-1', start: 0, end: 4, effectId: 'effect-clip-1' }] }],
        meta: { 'clip-1': { track: 'V1', from: 0, to: 4, speed: 1 } },
      }),
    };

    const { result } = renderHook(() => useClipEditing({
      dataRef,
      resolvedConfig: null,
      selectedClipId: 'clip-1',
      selectedTrack: null,
      currentTime: 0,
      setSelectedClipId: vi.fn(),
      setSelectedTrackId: vi.fn(),
      applyTimelineEdit,
      applyResolvedConfigEdit: vi.fn(),
    }));

    act(() => {
      result.current.handleSelectedClipChange({ speed: 2 });
    });

    expect(applyTimelineEdit).toHaveBeenCalledWith(
      [{ id: 'V1', actions: [{ id: 'clip-1', start: 0, end: 2, effectId: 'effect-clip-1' }] }],
      { 'clip-1': { speed: 2 } },
    );
  });

  it('recalculates action.end for bulk duration edits', () => {
    const applyTimelineEdit = vi.fn();
    const dataRef = {
      current: makeTimelineData({
        rows: [
          {
            id: 'V1',
            actions: [
              { id: 'clip-1', start: 0, end: 4, effectId: 'effect-clip-1' },
              { id: 'clip-2', start: 4, end: 7, effectId: 'effect-clip-2' },
            ],
          },
        ],
        meta: {
          'clip-1': { track: 'V1', from: 0, to: 4, speed: 1 },
          'clip-2': { track: 'V1', from: 0, to: 3, speed: 1 },
        },
      }),
    };

    const { result } = renderHook(() => useClipEditing({
      dataRef,
      resolvedConfig: null,
      selectedClipId: null,
      selectedTrack: null,
      currentTime: 0,
      setSelectedClipId: vi.fn(),
      setSelectedTrackId: vi.fn(),
      applyTimelineEdit,
      applyResolvedConfigEdit: vi.fn(),
    }));

    act(() => {
      result.current.handleUpdateClips(['clip-1', 'clip-2'], { speed: 2 });
    });

    expect(applyTimelineEdit).toHaveBeenCalledWith(
      [
        {
          id: 'V1',
          actions: [
            { id: 'clip-1', start: 0, end: 2, effectId: 'effect-clip-1' },
            { id: 'clip-2', start: 4, end: 5.5, effectId: 'effect-clip-2' },
          ],
        },
      ],
      {
        'clip-1': { speed: 2 },
        'clip-2': { speed: 2 },
      },
    );
  });
});
