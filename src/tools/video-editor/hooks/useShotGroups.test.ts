// @vitest-environment jsdom
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { TimelineShotGroupView } from '@/tools/video-editor/lib/timeline-domain';
import type { TimelineAction, TimelineRow } from '@/tools/video-editor/types/timeline-canvas';
import type { CanonicalShotOccurrence } from '@/tools/video-editor/data/shotCompositionAdapter';
import { getShotColor, projectCanonicalShotRows, useShotGroups } from './useShotGroups';

function buildAction(id: string, start: number, end: number): TimelineAction {
  return { id, start, end, effectId: `effect-${id}` };
}

function buildGroup(
  overrides: Partial<TimelineShotGroupView> = {},
): TimelineShotGroupView {
  const placedMembers = (overrides.placedMembers ?? [{
    generationId: 'gen-1',
    clipId: 'clip-1',
    assetKey: 'asset-1',
    variantId: 'variant-1',
    mediaRef: 'media-1',
    at: 0,
    duration: 2,
    pooled: false,
    stale: false,
  }]) as TimelineShotGroupView['placedMembers'];
  const pooledMembers = (overrides.pooledMembers ?? []) as TimelineShotGroupView['pooledMembers'];
  return {
    id: 'shot-1:V1',
    shotId: 'shot-1',
    name: 'Shot 1',
    trackId: 'V1',
    mode: 'images',
    placedMembers,
    pooledMembers,
    members: [...placedMembers, ...pooledMembers],
    finalVideo: null,
    derivedFrom: null,
    ...overrides,
  };
}

describe('useShotGroups', () => {
  it('prefers the occurrence track when another full-length row overlaps it', () => {
    const rows: TimelineRow[] = [
      { id: 'frame', actions: [buildAction('frame-overlay', 0, 120)] },
      { id: 'picture', actions: [buildAction('shot-child', 10, 12)] },
    ];
    const occurrence = {
      projectId: 'project-1',
      occurrenceId: 'occ-1',
      parentDocumentId: 'timeline-1',
      shotId: 'shot-1',
      revisionId: 'rev-1',
      ordinal: 0,
      atMs: 10_000,
      durationMs: 2_000,
      stableDeepLink: 'project/project-1/document/timeline-1/shot/shot-1/revision/rev-1/occurrence/occ-1',
      outputIdentity: 'project/project-1/document/timeline-1/occurrence/occ-1/output/final-video',
      trackId: 'picture',
      revision: { provenance: { name: 'Shot 1' } },
    } satisfies CanonicalShotOccurrence;

    const { result } = renderHook(() => useShotGroups(rows, [], [occurrence]));

    expect(result.current[0]).toMatchObject({
      rowId: 'picture',
      rowIndex: 1,
      clipIds: ['shot-child'],
      children: [{ clipId: 'shot-child', offset: 0, duration: 2 }],
    });
  });

  it('preserves authored canonical child offsets when the occurrence moves', () => {
    const rows: TimelineRow[] = [
      { id: 'frame', actions: [buildAction('frame-overlay', 0, 120)] },
      { id: 'picture', actions: [] },
      { id: 'V2', actions: [buildAction('occ-1:shot-child', 20, 22)] },
    ];
    const occurrence = {
      projectId: 'project-1',
      occurrenceId: 'occ-1',
      parentDocumentId: 'timeline-1',
      shotId: 'shot-1',
      revisionId: 'rev-1',
      ordinal: 0,
      atMs: 10_000,
      durationMs: 2_000,
      stableDeepLink: 'project/project-1/document/timeline-1/shot/shot-1/revision/rev-1/occurrence/occ-1',
      outputIdentity: 'project/project-1/document/timeline-1/occurrence/occ-1/output/final-video',
      trackId: 'picture',
      revision: { provenance: { name: 'Shot 1' } },
    } satisfies CanonicalShotOccurrence;

    const { result } = renderHook(() => useShotGroups(rows, [], [occurrence]));

    expect(result.current[0]).toMatchObject({
      rowId: 'V2',
      rowIndex: 2,
      start: 10,
      end: 12,
      clipIds: ['occ-1:shot-child'],
      children: [{ clipId: 'occ-1:shot-child', offset: 10, duration: 2 }],
    });

    const projectedRows = projectCanonicalShotRows(rows, result.current);
    const projectedAction = projectedRows[2].actions[0];
    expect(projectedAction).toMatchObject({ id: 'occ-1:shot-child', start: 20, end: 22 });
  });

  it('caps content-derived group and row geometry at the next contiguous cut', () => {
    const rows: TimelineRow[] = [{
      id: 'picture',
      actions: [
        buildAction('b1b0:child', 7.067, 11.534),
        buildAction('ed3b:child', 10.267, 15.867),
      ],
    }];
    const baseOccurrence = {
      projectId: 'project-1',
      parentDocumentId: 'timeline-1',
      shotId: 'shot-1',
      revisionId: 'rev-1',
      stableDeepLink: 'project/project-1/document/timeline-1/shot/shot-1/revision/rev-1/occurrence/',
      outputIdentity: 'project/project-1/document/timeline-1/occurrence/output/final-video',
      trackId: 'picture',
      revision: {
        internal_timeline_revision: {
          timeline: { clips: [{ at_ms: 0, duration_ms: 4467 }] },
        },
      },
    };
    const occurrences: CanonicalShotOccurrence[] = [
      {
        ...baseOccurrence,
        occurrenceId: 'b1b0',
        ordinal: 0,
        atMs: 7067,
        durationMs: 3200,
      },
      {
        ...baseOccurrence,
        occurrenceId: 'ed3b',
        ordinal: 1,
        atMs: 10267,
        durationMs: 4633,
        revision: {
          internal_timeline_revision: {
            timeline: { clips: [{ at_ms: 0, duration_ms: 4633 }] },
          },
        },
      },
    ];

    const { result } = renderHook(() => useShotGroups(rows, [], occurrences));
    expect(result.current[0]?.start).toBeCloseTo(7.067, 6);
    expect(result.current[0]?.end).toBeCloseTo(10.267, 6);
    expect(result.current[1]?.start).toBeCloseTo(10.267, 6);
    expect(result.current[1]?.end).toBeCloseTo(14.9, 6);

    const projectedRows = projectCanonicalShotRows(rows, result.current);
    expect(projectedRows[0].actions).toEqual([
      expect.objectContaining({ id: 'b1b0:child', start: 7.067, end: 11.534 }),
      expect.objectContaining({ id: 'ed3b:child', start: 10.267, end: 15.867 }),
    ]);
  });

  it('preserves leading gaps and overlaps between canonical child rows', () => {
    const rows: TimelineRow[] = [{ id: 'picture', actions: [
      buildAction('occ-1:first', 10.5, 13),
      buildAction('occ-1:overlap', 12, 15.5),
    ] }];
    const occurrence = {
      projectId: 'project-1', occurrenceId: 'occ-1', parentDocumentId: 'timeline-1',
      shotId: 'shot-1', revisionId: 'rev-1', ordinal: 0, atMs: 10_000, durationMs: 5_500,
      stableDeepLink: 'project/project-1/document/timeline-1/shot/shot-1/revision/rev-1/occurrence/occ-1',
      outputIdentity: 'project/project-1/document/timeline-1/occurrence/occ-1/output/final-video',
      trackId: 'picture', revision: { internal_timeline_revision: { timeline: { clips: [
        { at_ms: 500, duration_ms: 2_500 }, { at_ms: 2_000, duration_ms: 3_500 },
      ] } } },
    } satisfies CanonicalShotOccurrence;
    const { result } = renderHook(() => useShotGroups(rows, [], [occurrence]));

    expect(result.current[0]?.children).toEqual([
      { clipId: 'occ-1:first', offset: 0.5, duration: 2.5 },
      { clipId: 'occ-1:overlap', offset: 2, duration: 3.5 },
    ]);
    expect(projectCanonicalShotRows(rows, result.current)[0]?.actions).toEqual(rows[0]?.actions);
  });

  it('replaces timing only for an explicitly identified legacy shell', () => {
    const rows: TimelineRow[] = [{ id: 'picture', actions: [buildAction('old-shell', 10.2, 11.2)] }];
    const occurrence = {
      projectId: 'project-1', occurrenceId: 'occ-1', parentDocumentId: 'timeline-1',
      shotId: 'shot-1', revisionId: 'rev-1', ordinal: 0, atMs: 10_000, durationMs: 2_000,
      stableDeepLink: 'project/project-1/document/timeline-1/shot/shot-1/revision/rev-1/occurrence/occ-1',
      outputIdentity: 'project/project-1/document/timeline-1/occurrence/occ-1/output/final-video',
      trackId: 'picture', revision: {},
    } satisfies CanonicalShotOccurrence;
    const { result } = renderHook(() => useShotGroups(rows, [], [occurrence]));

    expect(projectCanonicalShotRows(rows, result.current, new Set(['old-shell']))[0]?.actions[0])
      .toMatchObject({ start: 10, end: 12 });
    expect(projectCanonicalShotRows(rows, result.current)[0]?.actions[0])
      .toMatchObject({ start: 10.2, end: 11.2 });
  });

  it('uses the canonical shot metadata name when provenance has no name', () => {
    const rows: TimelineRow[] = [{ id: 'picture', actions: [buildAction('shot-child', 0, 2)] }];
    const occurrence = {
      projectId: 'project-1',
      occurrenceId: 'occ-1',
      parentDocumentId: 'timeline-1',
      shotId: 'shot-1',
      revisionId: 'rev-1',
      ordinal: 0,
      atMs: 0,
      durationMs: 2_000,
      stableDeepLink: 'project/project-1/document/timeline-1/shot/shot-1/revision/rev-1/occurrence/occ-1',
      outputIdentity: 'project/project-1/document/timeline-1/occurrence/occ-1/output/final-video',
      trackId: 'picture',
      revision: { metadata: { name: '02 What this video covers' } },
    } satisfies CanonicalShotOccurrence;

    const { result } = renderHook(() => useShotGroups(rows, [], [occurrence]));

    expect(result.current[0]?.shotName).toBe('02 What this video covers');
  });

  it('returns deterministic colors and different colors for distinct sample shot ids', () => {
    expect(getShotColor('shot-a')).toBe(getShotColor('shot-a'));
    expect(new Set(['shot-a', 'shot-b', 'shot-c'].map((shotId) => getShotColor(shotId))).size).toBe(3);
  });

  it('returns empty array when pinnedShotGroups is undefined', () => {
    const rows: TimelineRow[] = [{ id: 'V1', actions: [buildAction('clip-1', 0, 1)] }];
    const { result } = renderHook(() => useShotGroups(rows, []));
    expect(result.current).toEqual([]);
  });

  it('returns pinned groups', () => {
    const rows: TimelineRow[] = [{ id: 'V1', actions: [buildAction('clip-1', 0, 2)] }];
    const { result } = renderHook(() => useShotGroups(
      rows,
      [buildGroup({ mode: 'video' })],
    ));

    expect(result.current).toEqual([{
      shotId: 'shot-1',
      shotName: 'Shot 1',
      rowId: 'V1',
      rowIndex: 0,
      start: 0,
      clipIds: ['clip-1'],
      children: [{ clipId: 'clip-1', offset: 0, duration: 2 }],
      color: getShotColor('shot-1'),
      mode: 'video',
      poolGenerationIds: [],
      variantIdsByGenerationId: { 'gen-1': 'variant-1' },
    }]);
  });

  it('resolves stale track ids against the live rows', () => {
    const rows: TimelineRow[] = [{ id: 'V1', actions: [buildAction('clip-1', 0, 2)] }];
    const { result } = renderHook(() => useShotGroups(
      rows,
      [buildGroup({ trackId: 'V2' })],
    ));
    expect(result.current).toEqual([{
      shotId: 'shot-1',
      shotName: 'Shot 1',
      rowId: 'V1',
      rowIndex: 0,
      start: 0,
      clipIds: ['clip-1'],
      children: [{ clipId: 'clip-1', offset: 0, duration: 2 }],
      color: getShotColor('shot-1'),
      mode: 'images',
      poolGenerationIds: [],
      variantIdsByGenerationId: { 'gen-1': 'variant-1' },
    }]);
  });

  it('derives group start and children from the live row actions instead of legacy projection fields', () => {
    const rows: TimelineRow[] = [{
      id: 'V1',
      actions: [
        buildAction('clip-2', 1, 2),
        buildAction('clip-1', 3, 5),
      ],
    }];
    const { result } = renderHook(() => useShotGroups(
      rows,
      [buildGroup({
        placedMembers: [
          { generationId: 'gen-1', clipId: 'clip-1', assetKey: 'a1', variantId: 'v1', mediaRef: 'm1', at: 3, duration: 2, pooled: false, stale: false },
          { generationId: 'gen-2', clipId: 'clip-2', assetKey: 'a2', variantId: 'v2', mediaRef: 'm2', at: 1, duration: 1, pooled: false, stale: false },
        ],
      })],
    ));

    expect(result.current).toEqual([{
      shotId: 'shot-1',
      shotName: 'Shot 1',
      rowId: 'V1',
      rowIndex: 0,
      start: 1,
      clipIds: ['clip-2', 'clip-1'],
      children: [
        { clipId: 'clip-2', offset: 0, duration: 1 },
        { clipId: 'clip-1', offset: 2, duration: 2 },
      ],
      color: getShotColor('shot-1'),
      mode: 'images',
      poolGenerationIds: [],
      variantIdsByGenerationId: { 'gen-1': 'v1', 'gen-2': 'v2' },
    }]);
  });

  it('filters out pinned groups whose live row actions are missing', () => {
    const rows: TimelineRow[] = [{ id: 'V1', actions: [] }];
    const { result } = renderHook(() => useShotGroups(
      rows,
      [buildGroup({
        placedMembers: [{ generationId: 'gen-1', clipId: 'clip-missing', assetKey: 'a1', variantId: 'v1', mediaRef: 'm1', at: 0, duration: 1, pooled: false, stale: false }],
      })],
    ));

    expect(result.current).toEqual([]);
  });

  it('keeps pool-only groups in the document view without relational shot rows', () => {
    const rows: TimelineRow[] = [{ id: 'V1', actions: [] }];
    const pooled = {
      generationId: 'gen-pool',
      clipId: null,
      assetKey: 'gen:gen-pool',
      variantId: 'variant-pool',
      mediaRef: 'media-pool',
      at: null,
      duration: null,
      pooled: true,
      stale: false,
    } as const;
    const group = buildGroup({ placedMembers: [], pooledMembers: [pooled], members: [pooled] });
    const { result } = renderHook(() => useShotGroups(rows, [group]));

    expect(result.current[0]).toMatchObject({
      shotId: 'shot-1',
      shotName: 'Shot 1',
      clipIds: [],
      poolGenerationIds: ['gen-pool'],
      variantIdsByGenerationId: { 'gen-pool': 'variant-pool' },
    });
  });
});
