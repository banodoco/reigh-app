// @vitest-environment jsdom
// dataKind V1 (Batch 6): useDataLanes — the host lane pipeline hook.
// Stub loaders prove the assembly/merge contract; the null loader proves the
// additive fail-open posture (base identity, empty lanes).
import { render, renderHook, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TimelineData, TranscriptSegment } from '@/tools/video-editor/lib/timeline-data.ts';
import type { ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import { TRANSCRIPT_SCHEMA_REF } from '@/tools/video-editor/data/typed/adaptTranscript.ts';
import type { DataKindSnapshotRecord } from '@/tools/video-editor/data/typed/assembleDataLanes.ts';
import { useDataLanePlane, useDataLanes, type LoadDataSegments } from './useDataLanes.ts';
import {
  VideoEditorRuntimeProvider,
  type VideoEditorRuntimeContextValue,
} from '@/tools/video-editor/contexts/VideoEditorRuntimeContext.tsx';
import { resetLaneAssemblyAuthorityForTests } from './dataLaneAssemblyAuthority.ts';
import shotFixture from '@/tools/video-editor/data/shotComposition.fixture.json';
import { createShotCompositionAdapter } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import { playedTimelineClips } from '@/tools/video-editor/lib/timeline-shot-summaries.ts';
import { buildTimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import { freezeSourceDataItem } from '@/tools/video-editor/data/typed/envelope.ts';

const SEGMENT: TranscriptSegment = { start: 2, end: 4, text: 'hello' };

const mediaEntry = (file: string, type: string) => ({ file, src: file, type });

/** Video clip at t=10 playing source seconds [2, 8) at speed 1. */
const VIDEO_CLIP = {
  id: 'c1',
  at: 10,
  track: 'v1',
  asset: 'a',
  from: 2,
  to: 8,
  speed: 1,
  assetEntry: mediaEntry('a.mp4', 'video/mp4'),
};

const CONFIG_SENTINEL = { clips: [], tracks: [] };

const buildBase = (clips: unknown[]): TimelineData =>
  ({
    config: CONFIG_SENTINEL,
    resolvedConfig: { clips } as unknown as ResolvedTimelineConfig,
    dataLanes: [],
  }) as unknown as TimelineData;

const transcriptKind = (overrides: Partial<DataKindSnapshotRecord> = {}): DataKindSnapshotRecord => ({
  kindId: 'transcript',
  schemaRef: TRANSCRIPT_SCHEMA_REF,
  shape: 'interval',
  domain: 'source_seconds',
  label: 'Transcript',
  laneRenderer: (props) => props,
  inspector: (props) => props,
  ...overrides,
});

describe('useDataLanes', () => {
  it('maps transcript lane items onto clips inside played shots at film time', async () => {
    const composition = createShotCompositionAdapter({ load: async () => shotFixture }).prepare(shotFixture);
    const base = await buildTimelineData(
      { output: { resolution: '1920x1080', fps: 30, file: 'out.mp4' }, tracks: [], clips: [] },
      { assets: {} },
    );
    const child = playedTimelineClips(composition, base.resolvedConfig)!.find((clip) =>
      clip.id.includes('alpha-audio'))!;
    expect(child).toBeDefined();
    const start = child.from ?? 0;
    const source = freezeSourceDataItem({
      id: 'shot-line', shape: 'interval', domain: 'source_seconds',
      extent: { start, end: start + 0.5 }, schemaRef: TRANSCRIPT_SCHEMA_REF,
      sourceArtifactRef: { assetId: child.asset! },
      provenance: { adapterId: 'astrid.projectTranscript', adapterVersion: '1' },
      payload: { sourceId: 'astrid.narration', segmentId: 'shot-line', text: 'inside shot' },
    });
    const withSource = { ...base, sourceItemsBySchemaRef: { [TRANSCRIPT_SCHEMA_REF]: [source] } };
    const runtime = {
      userId: null,
      shots: { shotComposition: {}, canonicalComposition: composition },
      timelineId: 'shot-lane',
    } as unknown as VideoEditorRuntimeContextValue;
    const { result } = renderHook(() => useDataLanes({ base: withSource, kinds: [transcriptKind()], loadSegments: null }), {
      wrapper: ({ children }) => <VideoEditorRuntimeProvider value={runtime}>{children}</VideoEditorRuntimeProvider>,
    });
    await waitFor(() => expect(result.current?.dataLanes[0]?.items.some((item) => item.clipId === child.id)).toBe(true));
    const item = result.current!.dataLanes[0].items.find((view) => view.clipId === child.id)!;
    expect(item.timelineStart).toBe(child.at);
    expect(item.timelineEnd).toBe(child.at + 0.5 / (child.speed ?? 1));
  });
  it('merges stub-loaded segments into a patched TimelineData carrying the expected DataLaneView[]', async () => {
    const loadSegments: LoadDataSegments = vi.fn(async () => [SEGMENT]);
    const base = buildBase([VIDEO_CLIP]);

    const kind = transcriptKind();
    const { result } = renderHook(() =>
      useDataLanes({ base, kinds: [kind], loadSegments }),
    );

    await waitFor(() => expect(result.current?.dataLanes).toHaveLength(1));

    const patched = result.current;
    expect(patched).not.toBe(base);
    expect(patched?.dataLanes).not.toBe(base.dataLanes); // fresh array per mergeDataLanes contract

    const [lane] = patched!.dataLanes;
    expect(lane.laneId).toBe('transcript');
    expect(lane.kindId).toBe('transcript');
    expect(lane.label).toBe('Transcript');
    expect(lane.schemaRef).toBe(TRANSCRIPT_SCHEMA_REF);
    expect(lane.opaque).toBe(false);
    expect(lane.laneRenderer).toBe(kind.laneRenderer);
    expect(lane.inspector).toBe(kind.inspector);
    const [view] = lane.items;
    expect(view.item.id).toBe('transcript-source:transcript%3Aa:segment:legacy-index-0@c1');
    expect(view.item.sourceItemId).toBe('transcript-source:transcript%3Aa:segment:legacy-index-0');
    expect(view.item.payload).toEqual({
      sourceId: 'transcript:a',
      segmentId: 'transcript-source:transcript%3Aa:segment:legacy-index-0',
      text: 'hello',
    });
    expect(view.timelineStart).toBe(10); // clip.at + (2 − 2)/1
    expect(view.timelineEnd).toBe(12);
    expect(view.clipId).toBe('c1');

    // Every other TimelineData field is preserved by reference.
    expect(patched?.config).toBe(base.config);
    // One fetch per asset per mount.
    expect(loadSegments).toHaveBeenCalledTimes(1);
    expect(loadSegments).toHaveBeenCalledWith('a');
  });

  it('returns base identity with empty lanes when the loader is null', () => {
    const base = buildBase([VIDEO_CLIP]);

    const { result } = renderHook(() =>
      useDataLanes({ base, kinds: [transcriptKind()], loadSegments: null }),
    );

    expect(result.current).toBe(base);
    expect(result.current?.dataLanes).toEqual([]);
  });

  it('returns base identity when no runtime provides a default loader', () => {
    const base = buildBase([VIDEO_CLIP]);

    // No VideoEditorRuntimeProvider above the hook → no default loader.
    const { result } = renderHook(() => useDataLanes({ base }));

    expect(result.current).toBe(base);
    expect(result.current?.dataLanes).toEqual([]);
  });

  it('fails open while mounted store data is waiting for resolvedConfig', () => {
    const bootstrapBase = {
      config: CONFIG_SENTINEL,
      dataLanes: [],
    } as unknown as TimelineData;
    const loadSegments = vi.fn<LoadDataSegments>();

    const { result } = renderHook(() => useDataLanes({
      base: bootstrapBase,
      kinds: [transcriptKind()],
      loadSegments,
    }));

    expect(result.current).toBe(bootstrapBase);
    expect(loadSegments).not.toHaveBeenCalled();
  });

  it('never fetches for non-sound-bearing media and stays at base identity', () => {
    const loadSegments = vi.fn<LoadDataSegments>();
    const imageClip = { ...VIDEO_CLIP, id: 'c2', assetEntry: mediaEntry('a.png', 'image/png') };
    const base = buildBase([imageClip]);

    const { result } = renderHook(() =>
      useDataLanes({ base, kinds: [transcriptKind()], loadSegments }),
    );

    expect(loadSegments).not.toHaveBeenCalled();
    expect(result.current).toBe(base);
  });

  it('maps Astrid audio/x-aac transcript segments onto the exact A1 carrier', async () => {
    const segments = [
      { start: 2, end: 4, text: 'first' },
      { start: 5, end: 8, text: 'second' },
    ];
    const loadSegments: LoadDataSegments = vi.fn(async () => segments);
    const audioClip = {
      id: 'paired-release-audio',
      at: 0,
      track: 'A1',
      asset: 'motion-output-audio.aac',
      from: 0,
      to: 8,
      speed: 1,
      assetEntry: mediaEntry('motion-output-audio.aac', 'audio/x-aac'),
    };
    const base = buildBase([audioClip]);

    const { result } = renderHook(() =>
      useDataLanes({ base, kinds: [transcriptKind()], loadSegments }),
    );

    await waitFor(() => expect(result.current?.dataLanes).toHaveLength(1));
    expect(loadSegments).toHaveBeenCalledTimes(1);
    expect(loadSegments).toHaveBeenCalledWith('motion-output-audio.aac');
    expect(result.current?.dataLanes[0]?.items).toHaveLength(2);
    expect(result.current?.dataLanes[0]?.items.map((item) => ({
      clipId: item.clipId,
      start: item.timelineStart,
      end: item.timelineEnd,
    }))).toEqual([
      { clipId: 'paired-release-audio', start: 2, end: 4 },
      { clipId: 'paired-release-audio', start: 5, end: 8 },
    ]);
  });

  it('last-write-wins: re-merges on base change from cached segments without refetching', async () => {
    const loadSegments: LoadDataSegments = vi.fn(async () => [SEGMENT]);
    const base = buildBase([VIDEO_CLIP]);

    const view = renderHook(({ base: currentBase }) =>
      useDataLanes({ base: currentBase, kinds: [transcriptKind()], loadSegments }), {
      initialProps: { base },
    });

    await waitFor(() => expect(view.result.current?.dataLanes).toHaveLength(1));
    expect(loadSegments).toHaveBeenCalledTimes(1);

    // New base object (same assets): re-merge only — no second fetch.
    const base2 = buildBase([VIDEO_CLIP]);
    view.rerender({ base: base2 });
    expect(view.result.current).not.toBe(base2);
    expect(view.result.current?.config).toBe(base2.config);
    expect(view.result.current?.dataLanes).toHaveLength(1);
    expect(loadSegments).toHaveBeenCalledTimes(1);
  });

  it('last-write-wins: kinds snapshot changes re-merge without refetching', async () => {
    const loadSegments: LoadDataSegments = vi.fn(async () => [SEGMENT]);
    const base = buildBase([VIDEO_CLIP]);

    const view = renderHook(({ kinds }) =>
      useDataLanes({ base, kinds, loadSegments }), {
      initialProps: { kinds: [transcriptKind()] as readonly DataKindSnapshotRecord[] },
    });

    await waitFor(() => expect(view.result.current?.dataLanes).toHaveLength(1));
    expect(view.result.current?.dataLanes[0]?.opaque).toBe(false);

    // Kinds gone (unregister analog): the same segments re-assemble opaque.
    view.rerender({ kinds: [] });
    await waitFor(() => expect(view.result.current?.dataLanes[0]?.opaque).toBe(true));
    expect(view.result.current?.dataLanes[0]?.laneId).toBe(`opaque:${TRANSCRIPT_SCHEMA_REF}`);
    expect(loadSegments).toHaveBeenCalledTimes(1);
  });

  it('survives a rejected loader: no segments, base identity, no throw', async () => {
    const loadSegments: LoadDataSegments = vi.fn(async () => {
      throw new Error('boom');
    });
    const base = buildBase([VIDEO_CLIP]);

    const { result } = renderHook(() =>
      useDataLanes({ base, kinds: [transcriptKind()], loadSegments }),
    );

    await waitFor(() => expect(loadSegments).toHaveBeenCalled());
    await waitFor(() => expect(result.current).toBe(base));
    expect(result.current?.dataLanes).toEqual([]);
  });

  it('single assembly authority across co-mounted surfaces: ONE fetch per asset', async () => {
    resetLaneAssemblyAuthorityForTests();
    const onProfileLoad = vi.fn(async () => ({ transcript: { segments: [SEGMENT] } }));
    // Production wiring: each surface derives its default loader from the
    // SHARED runtime object, so the authority's (loaderSource, timelineId)
    // key matches across both mounts and the cache is common.
    const runtime = {
      assetResolver: {
        resolveAssetUrl: async (file: string) => file,
        onProfileLoad,
      },
      timelineId: 'timeline-shared',
    } as unknown as VideoEditorRuntimeContextValue;

    const baseA = buildBase([VIDEO_CLIP]);
    const baseB = buildBase([VIDEO_CLIP]);
    const consumerA: { current: TimelineData | null } = { current: null };
    const consumerB: { current: TimelineData | null } = { current: null };

    function Consumer({ base, onResult }: {
      base: TimelineData;
      onResult: (patched: TimelineData | null) => void;
    }) {
      const patched = useDataLanes({ base });
      useEffect(() => { onResult(patched); }, [onResult, patched]);
      return null;
    }

    render(
      <VideoEditorRuntimeProvider value={runtime}>
        <Consumer base={baseA} onResult={(d) => { consumerA.current = d; }} />
        <Consumer base={baseB} onResult={(d) => { consumerB.current = d; }} />
      </VideoEditorRuntimeProvider>,
    );

    await waitFor(() => expect(consumerA.current?.dataLanes).toHaveLength(1));
    await waitFor(() => expect(consumerB.current?.dataLanes).toHaveLength(1));

    // Both surfaces mounted against the same asset; exactly ONE host fetch.
    expect(onProfileLoad).toHaveBeenCalledTimes(1);
    expect(onProfileLoad).toHaveBeenCalledWith({ assetId: 'a', timelineId: 'timeline-shared' });

    // Assembly stays per-consumer pure compute over each mount's own base:
    // distinct patched objects, no cross-surface leakage, and neither base's
    // dataLanes written (store-write neutrality holds under co-mounting).
    expect(consumerA.current).not.toBe(baseA);
    expect(consumerB.current).not.toBe(baseB);
    expect(consumerA.current).not.toBe(consumerB.current);
    expect(consumerA.current?.config).toBe(baseA.config);
    expect(consumerB.current?.config).toBe(baseB.config);
    expect(baseA.dataLanes).toEqual([]);
    expect(baseB.dataLanes).toEqual([]);
    expect(consumerA.current!.dataLanes[0]?.items[0]?.clipId).toBe('c1');
    expect(consumerB.current!.dataLanes[0]?.items[0]?.timelineStart).toBe(10);
  });
});


describe('selection pruning readiness', () => {
  it('distinguishes unresolved, successfully empty and failed source fetches', async () => {
    let finish!: (segments: readonly TranscriptSegment[]) => void;
    const loader = vi.fn(() => new Promise<readonly TranscriptSegment[]>(resolve => { finish = resolve; }));
    const base = buildBase([VIDEO_CLIP]);
    const kinds = [transcriptKind()];
    const pending = renderHook(() => useDataLanePlane({ base, kinds, loadSegments: loader }));
    expect(pending.result.current.resolved).toBe(false);
    await waitFor(() => expect(loader).toHaveBeenCalledOnce());
    finish([]);
    await waitFor(() => expect(pending.result.current.resolved).toBe(true));
    expect(pending.result.current.data?.dataLanes).toEqual([]);
    pending.unmount();
    const failed = vi.fn(async () => { throw new Error('source temporarily unavailable'); });
    const error = renderHook(() => useDataLanePlane({ base, kinds, loadSegments: failed }));
    await waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect(error.result.current.resolved).toBe(false);
  });
});
