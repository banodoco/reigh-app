// @vitest-environment jsdom
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '@/tools/video-editor/data/shotComposition.fixture.json';
import { createShotCompositionAdapter, type ShotPlacement } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import type { CanonicalShotTimelineDraft, CanonicalShotTimelineScope } from '@/tools/video-editor/runtime/ports.ts';
import { preserveThumbnailMapIdentity, useAstridShotsHost } from './useAstridShotsHost.ts';

vi.mock('@/tools/travel-between-images/hooks/video/useShotFinalVideos.ts', () => ({
  useShotFinalVideos: () => ({ finalVideoMap: new Map() }),
}));

const projectId = 'project-001';
const parentDocumentId = 'document-primary';
const occurrenceId = 'occ-1';

function graphWithHead(headRevisionId: string) {
  const graph = JSON.parse(JSON.stringify(fixture)) as typeof fixture;
  graph.primary_timeline.head.revision_id = headRevisionId;
  return graph;
}

function scope(editorSessionId = 'session-A'): CanonicalShotTimelineScope {
  return { projectId, parentDocumentId, occurrenceId, editorSessionId };
}

describe('useAstridShotsHost optimistic shot timeline bridge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows parent placements before hydration without exposing a partial composition', async () => {
    let resolveLoad!: (value: unknown) => void;
    const load = vi.fn(() => new Promise<unknown>((resolve) => { resolveLoad = resolve; }));
    const placement = {
      occurrenceId, shotId: 'chapter-opening', ordinal: 0, atMs: 1_000,
      durationMs: 2_000, trackId: 'picture',
    };
    const loadPlacements = vi.fn().mockResolvedValue([placement]);
    const port = { load, loadPlacements };
    const { result } = renderHook(() => useAstridShotsHost(projectId, parentDocumentId, port));

    await waitFor(() => expect(result.current.pendingOccurrences).toEqual([placement]));
    expect(result.current.canonicalComposition).toBeNull();
    expect(result.current.canonicalOccurrences).toEqual([]);
    await act(async () => { resolveLoad(fixture); });
    expect(result.current.pendingOccurrences).toEqual([]);
    expect(result.current.canonicalComposition?.occurrences[0]?.occurrenceId).toBe(occurrenceId);
  });

  it('starts a new generation while an older load is still in flight', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    const load = vi.fn(() => new Promise<unknown>((resolve) => { resolvers.push(resolve); }));
    const port = { load };
    const { result } = renderHook(() => useAstridShotsHost(projectId, parentDocumentId, port));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    act(() => result.current.refetchShots());
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
    await act(async () => { resolvers[1](graphWithHead('new-head')); });
    await act(async () => { resolvers[0](fixture); });
    expect(result.current.canonicalComposition?.headRevisionId).toBe('new-head');
  });

  it('does not restore placeholders after the canonical read fails', async () => {
    let resolvePlacements!: (value: readonly ShotPlacement[]) => void;
    const load = vi.fn().mockRejectedValue(new Error('read failed'));
    const loadPlacements = vi.fn(() => new Promise<readonly ShotPlacement[]>((resolve) => {
      resolvePlacements = resolve;
    }));
    const port = { load, loadPlacements };
    const { result } = renderHook(() => useAstridShotsHost(projectId, parentDocumentId, port));
    await waitFor(() => expect(result.current.canonicalCompositionError?.message).toBe('read failed'));

    await act(async () => {
      resolvePlacements([{ occurrenceId, shotId: 'chapter-opening', ordinal: 0, atMs: 0, durationMs: 2_000, trackId: 'picture' }]);
    });
    expect(result.current.pendingOccurrences).toEqual([]);
  });

  it('keeps a newer draft visible over an exact acknowledgement without refetching', async () => {
    const load = vi.fn().mockResolvedValue(fixture);
    const adapter = createShotCompositionAdapter({ load });
    const port = { load };
    const { result } = renderHook(() => useAstridShotsHost(projectId, parentDocumentId, port));
    await waitFor(() => expect(result.current.canonicalComposition?.headRevisionId).toBe(adapter.prepare(fixture).headRevisionId));

    const base = result.current.canonicalComposition!;
    const draftComposition = {
      ...base,
      occurrences: base.occurrences.map((occurrence) => occurrence.occurrenceId === occurrenceId
        ? { ...occurrence, durationMs: occurrence.durationMs + 750 }
        : occurrence),
    };
    act(() => {
      result.current.beginCanonicalDraftSession?.(scope());
      result.current.setCanonicalDraftProjection?.({
        scope: scope(),
        generation: 2,
        composition: draftComposition,
      } satisfies CanonicalShotTimelineDraft);
      result.current.endCanonicalDraftSession?.(scope());
    });
    expect(result.current.canonicalOccurrences.find((item) => item.occurrenceId === occurrenceId)?.durationMs)
      .toBe(base.occurrences.find((item) => item.occurrenceId === occurrenceId)!.durationMs + 750);

    const acknowledged = adapter.prepare(graphWithHead('timeline-head-ack-A'));
    act(() => result.current.adoptCanonicalComposition?.(acknowledged, {
      scope: scope(),
      generation: 1,
      expectedHeadRevisionId: base.headRevisionId,
    }));

    expect(result.current.canonicalComposition?.headRevisionId).toBe(acknowledged.headRevisionId);
    expect(result.current.canonicalDraft?.generation).toBe(2);
    expect(result.current.canonicalOccurrences.find((item) => item.occurrenceId === occurrenceId)?.durationMs)
      .toBe(base.occurrences.find((item) => item.occurrenceId === occurrenceId)!.durationMs + 750);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('does not let a delayed pre-ack load roll the host back from the acknowledged head', async () => {
    let resolveLoad!: (value: unknown) => void;
    const load = vi.fn(() => new Promise<unknown>((resolve) => { resolveLoad = resolve; }));
    const adapter = createShotCompositionAdapter({ load });
    const port = { load };
    const { result } = renderHook(() => useAstridShotsHost(projectId, parentDocumentId, port));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    const acknowledged = adapter.prepare(graphWithHead('timeline-head-ack'));
    act(() => result.current.adoptCanonicalComposition?.(acknowledged, {
      scope: scope(),
      generation: 1,
      expectedHeadRevisionId: adapter.prepare(fixture).headRevisionId,
    }));
    await act(async () => { resolveLoad(fixture); });

    expect(result.current.canonicalComposition?.headRevisionId).toBe(acknowledged.headRevisionId);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('marks a failed refresh stale, preserves the draft, and retries to the current head', async () => {
    const nextHead = graphWithHead('timeline-head-after-retry');
    const load = vi.fn()
      .mockResolvedValueOnce(fixture)
      .mockRejectedValueOnce(new Error('temporary Runtime read failure'))
      .mockResolvedValueOnce(nextHead);
    const adapter = createShotCompositionAdapter({ load });
    const port = { load };
    const { result } = renderHook(() => useAstridShotsHost(
      projectId,
      parentDocumentId,
      port,
    ));
    await waitFor(() => expect(result.current.canonicalComposition?.headRevisionId)
      .toBe(adapter.prepare(fixture).headRevisionId));

    const pinnedHead = result.current.canonicalComposition!;
    const draftComposition = {
      ...pinnedHead,
      occurrences: pinnedHead.occurrences.map((occurrence) => occurrence.occurrenceId === occurrenceId
        ? { ...occurrence, durationMs: occurrence.durationMs + 900 }
        : occurrence),
    };
    act(() => {
      result.current.beginCanonicalDraftSession?.(scope());
      result.current.setCanonicalDraftProjection?.({
        scope: scope(),
        generation: 4,
        composition: draftComposition,
      } satisfies CanonicalShotTimelineDraft);
    });

    act(() => result.current.refetchShots());
    await waitFor(() => expect(result.current.canonicalCompositionError?.message)
      .toBe('temporary Runtime read failure'));
    expect(result.current.canonicalComposition?.headRevisionId).toBe(pinnedHead.headRevisionId);
    expect(result.current.canonicalDraft?.generation).toBe(4);
    expect(result.current.canonicalOccurrences.find((item) => item.occurrenceId === occurrenceId)?.durationMs)
      .toBe(pinnedHead.occurrences.find((item) => item.occurrenceId === occurrenceId)!.durationMs + 900);

    act(() => result.current.refetchShots());
    await waitFor(() => expect(result.current.canonicalComposition?.headRevisionId)
      .toBe(adapter.prepare(nextHead).headRevisionId));
    expect(result.current.canonicalCompositionError).toBeNull();
    expect(result.current.canonicalDraft?.generation).toBe(4);
    expect(load).toHaveBeenCalledTimes(3);
  });

  it('keeps thumbnail Map identity when a poll returns unchanged URLs', () => {
    const current = new Map([['occ-1', 'thumb-a'], ['occ-2', 'thumb-b']]);
    const unchanged = new Map([['occ-1', 'thumb-a'], ['occ-2', 'thumb-b']]);
    const changed = new Map([['occ-1', 'thumb-a'], ['occ-2', 'thumb-c']]);

    expect(preserveThumbnailMapIdentity(current, unchanged)).toBe(current);
    expect(preserveThumbnailMapIdentity(current, changed)).toBe(changed);
  });
});
