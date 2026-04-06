// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Shot } from '@/domains/generation/types';
import type { TimelineAction, TimelineRow } from '@/tools/video-editor/types/timeline-canvas';
import { getShotColor, useShotGroups } from './useShotGroups';

function buildAction(id: string, start: number, end: number): TimelineAction {
  return { id, start, end, effectId: `effect-${id}` };
}

function buildShot(id: string, name: string): Shot {
  return { id, name, images: [] } as Shot;
}

describe('useShotGroups', () => {
  it('returns deterministic colors and different colors for distinct sample shot ids', () => {
    expect(getShotColor('shot-a')).toBe(getShotColor('shot-a'));
    expect(new Set(['shot-a', 'shot-b', 'shot-c'].map((shotId) => getShotColor(shotId))).size).toBe(3);
  });

  it('returns empty array when pinnedShotGroups is undefined', () => {
    const rows: TimelineRow[] = [{ id: 'V1', actions: [buildAction('clip-1', 0, 1)] }];
    const { result } = renderHook(() => useShotGroups(rows, [buildShot('shot-1', 'Shot 1')]));
    expect(result.current).toEqual([]);
  });

  it('returns pinned groups', () => {
    const rows: TimelineRow[] = [{ id: 'V1', actions: [buildAction('clip-1', 0, 2)] }];
    const { result } = renderHook(() => useShotGroups(
      rows,
      [buildShot('shot-1', 'Shot 1')],
      [{ shotId: 'shot-1', trackId: 'V1', clipIds: ['clip-1'], mode: 'video' }],
    ));

    expect(result.current).toEqual([{
      shotId: 'shot-1',
      shotName: 'Shot 1',
      rowId: 'V1',
      rowIndex: 0,
      clipIds: ['clip-1'],
      color: getShotColor('shot-1'),
      mode: 'video',
    }]);
  });

  it('filters out pinned groups whose trackId does not match any row', () => {
    const rows: TimelineRow[] = [{ id: 'V1', actions: [buildAction('clip-1', 0, 2)] }];
    const { result } = renderHook(() => useShotGroups(
      rows,
      [buildShot('shot-1', 'Shot 1')],
      [{ shotId: 'shot-1', trackId: 'V2', clipIds: ['clip-1'], mode: 'images' }],
    ));
    expect(result.current).toEqual([]);
  });

  it('filters out dead clip ids that are not present in the row actions', () => {
    const rows: TimelineRow[] = [{ id: 'V1', actions: [buildAction('clip-1', 0, 1), buildAction('clip-2', 1, 2)] }];
    const { result } = renderHook(() => useShotGroups(
      rows,
      [buildShot('shot-1', 'Shot 1')],
      [{ shotId: 'shot-1', trackId: 'V1', clipIds: ['clip-1', 'clip-ghost', 'clip-2'], mode: 'images' }],
    ));

    expect(result.current).toEqual([{
      shotId: 'shot-1',
      shotName: 'Shot 1',
      rowId: 'V1',
      rowIndex: 0,
      clipIds: ['clip-1', 'clip-2'],
      color: getShotColor('shot-1'),
      mode: 'images',
    }]);
  });
});
