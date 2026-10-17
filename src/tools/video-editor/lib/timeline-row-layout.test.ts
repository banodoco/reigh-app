import { describe, expect, it } from 'vitest';
import type { DataLaneView } from '@/tools/video-editor/data/typed/envelope.ts';
import type { TrackDefinition } from '@/tools/video-editor/types/index.ts';
import { buildTimelineRowLayout, normalizeTimelineDataLanePlacement, reorderTimelineRows, resolveTimelineLaneHeight } from './timeline-row-layout.ts';
const tracks: TrackDefinition[] = [{ id: 'v', label: 'Video', kind: 'visual' }, { id: 'a', label: 'Audio', kind: 'audio' }];
const lane = (laneId = 'astrid.transcript', height = 24, hidden = false) => ({ laneId, height, hidden, opaque: true }) as DataLaneView;
const ids = (placement?: unknown, lanes = [lane()]) => buildTimelineRowLayout({ tracks, lanes, placement, mediaRowHeight: 48 }).rows.map(row => row.sortableId);
const placement = (beforeTrackId: string | null) => ({ version: 1 as const, lanes: [{ laneId: 'astrid.transcript', beforeTrackId }] });
describe('mixed timeline row layout', () => {
  it('keeps legacy tracks then lanes without metadata writes', () => {
    expect(ids()).toEqual(['track-v', 'track-a', 'data-lane-astrid.transcript']);
    expect(buildTimelineRowLayout({ tracks, lanes: [], mediaRowHeight: 48 }).totalHeight).toBe(96);
  });
  it('materializes above, between, below at actual shallow/overlap heights', () => {
    expect(ids(placement('v'))[0]).toBe('data-lane-astrid.transcript');
    const layout = buildTimelineRowLayout({ tracks, lanes: [lane(undefined, 72)], placement: placement('a'), mediaRowHeight: 48 });
    expect(layout.rows.map(row => [row.id, row.top, row.height, row.mediaRowIndex])).toEqual([
      ['v', 0, 48, 0], ['astrid.transcript', 48, 72, undefined], ['a', 120, 48, 1],
    ]);
    expect(layout.trackRects.get('a')).toEqual({ top: 120, height: 48, mediaRowIndex: 1 });
    expect(layout.totalHeight).toBe(168);
    expect(ids(placement(null)).at(-1)).toBe('data-lane-astrid.transcript');
  });
  it('ignores malformed and duplicate metadata, unknown lanes, and absent anchors', () => {
    const normalized = normalizeTimelineDataLanePlacement({ version: 1, lanes: [null, {}, { laneId: 'x', beforeTrackId: 3 }, ...placement('missing').lanes, ...placement('v').lanes, { laneId: 'unknown', beforeTrackId: 'v' }] });
    expect(normalized.lanes).toHaveLength(2);
    expect(ids(normalized)).toEqual(ids());
    expect(ids({ version: 2, lanes: placement('v').lanes })).toEqual(ids());
  });
  it('moves only lane metadata while retaining exact media objects and hidden placement', () => {
    const old = { version: 1, lanes: [{ laneId: 'hidden', beforeTrackId: 'a' }] };
    const next = reorderTimelineRows({ tracks, lanes: [lane(), lane('hidden', 24, true)], placement: old, activeId: 'data-lane-astrid.transcript', overId: 'track-a' })!;
    expect(next.tracks).toBe(tracks);
    expect(next.placement.lanes).toEqual([{ laneId: 'hidden', beforeTrackId: 'a' }, ...placement('a').lanes]);
    expect(ids(next.placement)).toEqual(['track-v', 'data-lane-astrid.transcript', 'track-a']);
    expect(ids(next.placement, [])).toEqual(['track-v', 'track-a']);
    expect(ids(next.placement)).toEqual(['track-v', 'data-lane-astrid.transcript', 'track-a']);
  });
  it('moves media across a lane atomically even with unchanged media projection order', () => {
    const next = reorderTimelineRows({ tracks, lanes: [lane()], placement: placement('a'), activeId: 'track-v', overId: 'data-lane-astrid.transcript' })!;
    expect(next.tracks).toBe(tracks);
    expect(ids(next.placement)).toEqual(['data-lane-astrid.transcript', 'track-v', 'track-a']);
    const reordered = reorderTimelineRows({ tracks, lanes: [lane()], placement: placement('a'), activeId: 'track-v', overId: 'track-a' })!;
    expect(reordered.tracks.map(track => track.id)).toEqual(['a', 'v']);
    expect(reordered.placement).toEqual(placement('a'));
  });
  it('uses stable anchors through non-UI track reorder and missing-anchor deletion', () => {
    const config = placement('a');
    expect(buildTimelineRowLayout({ tracks: [...tracks].reverse(), lanes: [lane()], placement: config, mediaRowHeight: 48 }).rows.map(row => row.id)).toEqual(['astrid.transcript', 'a', 'v']);
    expect(buildTimelineRowLayout({ tracks: tracks.slice(0, 1), lanes: [lane()], placement: config, mediaRowHeight: 48 }).rows.map(row => row.id)).toEqual(['v', 'astrid.transcript']);
  });
  it('retains tie order, no phantom rows, and invalid/identical drag is a no-op', () => {
    expect(ids({ version: 1, lanes: [{ laneId: 'two', beforeTrackId: 'a' }, ...placement('a').lanes] }, [lane(), lane('two')])).toEqual(['track-v', 'data-lane-two', 'data-lane-astrid.transcript', 'track-a']);
    expect(reorderTimelineRows({ tracks, lanes: [lane()], activeId: 'unknown', overId: 'track-v' })).toBeNull();
    expect(reorderTimelineRows({ tracks, lanes: [lane()], activeId: 'track-v', overId: 'track-v' })).toBeNull();
  });
});

it('defaults future interval/point lanes to host rows, grows overlap rows, and honors explicit laneHeight', () => {
  const interval = { ...lane('future.extension'), shape: 'interval', items: [
    { timelineStart: 0, timelineEnd: 2 }, { timelineStart: 2, timelineEnd: 3 },
  ] } as DataLaneView;
  expect(resolveTimelineLaneHeight(interval, 48)).toBe(48);
  expect(resolveTimelineLaneHeight({ ...interval, items: [{ timelineStart: 0, timelineEnd: 2 }, { timelineStart: 1, timelineEnd: 3 }] } as DataLaneView, 48)).toBe(96);
  expect(resolveTimelineLaneHeight({ ...interval, shape: 'point' }, 64)).toBe(64);
  expect(resolveTimelineLaneHeight({ ...interval, heightOverride: 73 }, 48)).toBe(73);
  expect(resolveTimelineLaneHeight({ ...interval, heightOverride: Number.NaN }, 48)).toBe(48);
});
