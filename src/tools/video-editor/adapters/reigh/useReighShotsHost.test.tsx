// @vitest-environment jsdom
import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import fixture from '@/tools/video-editor/data/shotComposition.fixture.json';
import { createShotCompositionAdapter } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import type { CanonicalShotTimelineDraft, CanonicalShotTimelineScope } from '@/tools/video-editor/runtime/ports.ts';
import { useReighShotsHost } from './useReighShotsHost.ts';

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

describe('useReighShotsHost optimistic shot timeline bridge', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps a newer draft visible over an exact acknowledgement without refetching', async () => {
    const load = vi.fn().mockResolvedValue(fixture);
    const adapter = createShotCompositionAdapter({ load });
    const port = { load };
    const { result } = renderHook(() => useReighShotsHost(projectId, parentDocumentId, port));
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
    const { result } = renderHook(() => useReighShotsHost(projectId, parentDocumentId, port));
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
});
