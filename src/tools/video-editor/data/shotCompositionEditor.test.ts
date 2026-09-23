import { describe, expect, it } from 'vitest';
import fixture from './shotComposition.fixture.json';
import {
  CanonicalShotCompositionHistory,
  duplicateIndependentShot,
  duplicateLinkedOccurrence,
  hardDurationMs,
  moveCanonicalOccurrence,
  replaceCanonicalMedia,
  trimCanonicalOccurrence,
  updateCanonicalShotTimeline,
  updateCanonicalShotSettings,
} from './shotCompositionEditor.ts';
import { parseShotComposition, stableOccurrenceDeepLink, stableOutputIdentity } from './shotComposition.ts';
import {
  timelineContentExtentMs,
  timelineOccurrenceEffectiveDurationMs,
} from './shotCompositionTiming.ts';

describe('canonical shot-composition editor operations', () => {
  it('repairs a stored empty-tail occurrence by deriving its end from content', async () => {
    const occurrenceId = 'b9a999b8-d3e1-5c94-8b6e-b5d53dc6af27';
    const projectId = String(fixture.project.project_id);
    const documentId = String(fixture.project.document_id);
    const targetOccurrence = {
      ...fixture.occurrences[0],
      occurrence_id: occurrenceId,
      at_ms: 14900,
      duration_ms: 2033,
      stable_deep_link: stableOccurrenceDeepLink(projectId, documentId, 'shot-alpha', 'rev-a', occurrenceId),
      output_identity: stableOutputIdentity(projectId, documentId, occurrenceId),
    };
    const graph = parseShotComposition({
      ...fixture,
      // Keep the repair isolated from the fixture's later shared occurrence;
      // the shared-revision blocker rule is covered separately below.
      occurrences: [targetOccurrence],
    });

    const repaired = await updateCanonicalShotTimeline(graph, occurrenceId, {
      tracks: [{ id: 'video', kind: 'visual' }],
      clips: [{ id: 'creative-tools', clip_type: 'media', track: 'video', at: 0, hold: 5.9 }],
    });
    expect(repaired.occurrences.find((candidate) => candidate.occurrence_id === occurrenceId))
      .toMatchObject({ at_ms: 14900, duration_ms: 5900 });
  });

  it('reconciles only the targeted stored tail to the furthest active content end', async () => {
    const graph = parseShotComposition(fixture);
    const repaired = await updateCanonicalShotTimeline(graph, 'occ-1', {
      tracks: [{ id: 'video', kind: 'visual' }],
      clips: [{ id: 'active-content', clip_type: 'media', track: 'video', at: 0, hold: 3.43 }],
    });

    expect(repaired.occurrences.find((candidate) => candidate.occurrence_id === 'occ-1'))
      .toMatchObject({ duration_ms: 3430 });
    expect(repaired.occurrences.find((candidate) => candidate.occurrence_id === 'occ-2'))
      .toMatchObject({ duration_ms: 2000, revision_id: 'rev-a' });
  });

  it('moves and trims an occurrence without changing its pinned revision identity', () => {
    const graph = parseShotComposition(fixture);
    const moved = moveCanonicalOccurrence(graph, { occurrenceId: 'occ-1', atMs: 1500 });
    const occurrence = moved.occurrences.find((candidate) => candidate.occurrence_id === 'occ-1');

    expect(occurrence).toMatchObject({
      shot_id: 'shot-alpha',
      revision_id: 'rev-a',
      at_ms: 1500,
      duration_ms: 2000,
      placement: { start_ms: 1500 },
    });
    expect(occurrence?.stable_deep_link).toContain('/shot/shot-alpha/revision/rev-a/occurrence/occ-1');
    expect(() => trimCanonicalOccurrence(moved, { occurrenceId: 'occ-1', durationMs: 1800 }))
      .toThrow('before active content');
  });

  it('keeps linked reuse occurrence-distinct while independent duplication creates a new revision', () => {
    const graph = parseShotComposition(fixture);
    const linked = duplicateLinkedOccurrence(graph, 'occ-1', 'occ-linked');
    const independent = duplicateIndependentShot(linked, 'occ-1', {
      shotId: 'shot-alpha-independent',
      revisionId: 'rev-independent',
      internalTimelineRevisionId: 'timeline-independent',
      occurrenceId: 'occ-independent',
    });

    const linkedOccurrence = independent.occurrences.find((candidate) => candidate.occurrence_id === 'occ-linked');
    const independentOccurrence = independent.occurrences.find((candidate) => candidate.occurrence_id === 'occ-independent');
    expect(linkedOccurrence).toMatchObject({ shot_id: 'shot-alpha', revision_id: 'rev-a' });
    expect(independentOccurrence).toMatchObject({ shot_id: 'shot-alpha-independent', revision_id: 'rev-independent' });
    expect(independent.shot_revisions).toContainEqual(expect.objectContaining({
      shot_id: 'shot-alpha-independent',
      revision_id: 'rev-independent',
      internal_timeline_revision: expect.objectContaining({ revision_id: 'timeline-independent' }),
    }));
  });

  it('supports undo and redo over canonical graph edits', () => {
    const graph = parseShotComposition(fixture);
    const history = new CanonicalShotCompositionHistory(graph);
    const moved = history.commit(moveCanonicalOccurrence(graph, { occurrenceId: 'occ-1', atMs: 900 }));
    expect(moved.occurrences.find((candidate) => candidate.occurrence_id === 'occ-1')?.at_ms).toBe(900);
    expect(history.undo().occurrences.find((candidate) => candidate.occurrence_id === 'occ-1')?.at_ms).toBe(0);
    expect(history.redo().occurrences.find((candidate) => candidate.occurrence_id === 'occ-1')?.at_ms).toBe(900);
  });

  it('keeps content-derived growth and shrink in one undoable graph command', async () => {
    const graph = parseShotComposition(fixture);
    const grown = await updateCanonicalShotTimeline(graph, 'occ-1', {
      tracks: [{ id: 'video', kind: 'visual' }],
      clips: [{ id: 'alpha-video', clip_type: 'media', track: 'video', at: 1.5, hold: 2 }],
    });
    expect(grown.occurrences.find((candidate) => candidate.occurrence_id === 'occ-1'))
      .toMatchObject({ duration_ms: 3500 });

    const shrunk = await updateCanonicalShotTimeline(grown, 'occ-1', {
      tracks: [{ id: 'video', kind: 'visual' }],
      clips: [{ id: 'alpha-video', clip_type: 'media', track: 'video', at: 0, hold: 0.5 }],
    });
    expect(shrunk.occurrences.find((candidate) => candidate.occurrence_id === 'occ-1'))
      .toMatchObject({ duration_ms: 500 });

    const history = new CanonicalShotCompositionHistory(graph);
    history.commit(grown);
    expect(history.undo().occurrences.find((candidate) => candidate.occurrence_id === 'occ-1')?.duration_ms)
      .toBe(2000);
    expect(history.redo().occurrences.find((candidate) => candidate.occurrence_id === 'occ-1')?.duration_ms)
      .toBe(3500);
  });

  it('publishes shot settings as a new immutable revision for the targeted occurrence', async () => {
    const graph = parseShotComposition(fixture);
    const updated = await updateCanonicalShotSettings(graph, 'occ-1', {
      generationMode: 'timeline',
      prompt: 'A revised prompt',
    });
    const first = updated.occurrences.find((candidate) => candidate.occurrence_id === 'occ-1');
    const linked = updated.occurrences.find((candidate) => candidate.occurrence_id === 'occ-2');
    const oldRevision = updated.shot_revisions.find((revision) => revision.shot_id === 'shot-alpha' && revision.revision_id === 'rev-a');
    const newRevision = updated.shot_revisions.find((revision) => revision.revision_id === first?.revision_id);

    expect(first?.revision_id).not.toBe('rev-a');
    expect(first?.shot_id).not.toBe('shot-alpha');
    expect(linked?.revision_id).toBe('rev-a');
    expect(linked?.shot_id).toBe('shot-alpha');
    const copiedItem = (newRevision?.items as Record<string, any>[] | undefined)?.[0];
    if (copiedItem) {
      expect(copiedItem.item_id).toContain(`${first?.shot_id}:`);
      expect(copiedItem.metadata?.source_item_id).toContain(`${first?.shot_id}:`);
    }
    expect(oldRevision).toBeDefined();
    expect(newRevision).toMatchObject({
      shot_id: first?.shot_id,
      publish: true,
      settings: { generationMode: 'timeline', prompt: 'A revised prompt' },
    });
    expect((newRevision?.internal_timeline_revision as Record<string, any>)?.revision_id)
      .not.toBe('timeline-alpha-a');
    expect((newRevision?.internal_timeline_revision as Record<string, any>)?.publish).toBe(true);
    expect(newRevision?.content_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(updated.primary_timeline.head.revision_id).not.toBe('timeline-rev-2');
    expect(() => parseShotComposition(updated)).not.toThrow();
  });

  it('remaps schema-owned item bindings while preserving opaque literals', async () => {
    const graph = parseShotComposition(structuredClone(fixture));
    const source = graph.shot_revisions.find((revision) => revision.shot_id === 'shot-alpha' && revision.revision_id === 'rev-a');
    if (!source) throw new Error('fixture shot revision missing');
    source.items = [{
      item_id: 'item-1',
      metadata: {
        source_item_id: 'item-1',
        selected_item_id: 'item-1',
        parent_item_id: 'item-1',
        bound_item_id: 'item-1',
        bound_item_ids: ['item-1'],
        opaque_literal: 'item-1',
      },
    }];

    const updated = await updateCanonicalShotSettings(graph, 'occ-1', { prompt: 'new' });
    const selected = updated.occurrences.find((occurrence) => occurrence.occurrence_id === 'occ-1');
    const revision = updated.shot_revisions.find((candidate) => candidate.revision_id === selected?.revision_id);
    const item = (revision?.items as Record<string, any>[])[0];
    expect(item.item_id).toBe(`${selected?.shot_id}:item-1`);
    expect(item.metadata).toMatchObject({
      source_item_id: item.item_id,
      selected_item_id: item.item_id,
      parent_item_id: item.item_id,
      bound_item_id: item.item_id,
      bound_item_ids: [item.item_id],
      opaque_literal: 'item-1',
    });
    expect((source.items as Record<string, any>[])[0].item_id).toBe('item-1');
  });

  it('materializes a shot shared across different pinned revisions', async () => {
    const graph = parseShotComposition(structuredClone(fixture));
    const source = graph.shot_revisions.find((revision) => revision.shot_id === 'shot-alpha' && revision.revision_id === 'rev-a');
    if (!source) throw new Error('fixture shot revision missing');
    graph.shot_revisions.push({ ...source, revision_id: 'rev-b' });
    graph.occurrences[1].revision_id = 'rev-b';

    const updated = await updateCanonicalShotSettings(graph, 'occ-1', { prompt: 'new' });
    expect(updated.occurrences[0].shot_id).not.toBe('shot-alpha');
    expect(updated.occurrences[1]).toMatchObject({ shot_id: 'shot-alpha', revision_id: 'rev-b' });
  });

  it('publishes shot-local timeline edits as a new immutable internal revision', async () => {
    const graph = parseShotComposition(fixture);
    const updated = await updateCanonicalShotTimeline(graph, 'occ-1', {
      tracks: [{ id: 'video', kind: 'visual' }],
      clips: [{ id: 'alpha-video', clip_type: 'media', track: 'video', at: 1.5, hold: 2 }],
    });
    const occurrence = updated.occurrences.find((candidate) => candidate.occurrence_id === 'occ-1');
    const revision = updated.shot_revisions.find((candidate) => candidate.revision_id === occurrence?.revision_id);
    const internal = revision?.internal_timeline_revision as Record<string, any> | undefined;

    expect(occurrence?.revision_id).not.toBe('rev-a');
    expect(internal?.revision_id).not.toBe('timeline-alpha-a');
    expect(internal?.publish).toBe(true);
    expect(internal?.timeline).toEqual(expect.objectContaining({
      clips: [expect.objectContaining({ id: expect.stringContaining(':alpha-video'), at: 1.5 })],
    }));
    expect((internal?.timeline as Record<string, any>).tracks[0].id).toBe('video');
    expect(((internal?.timeline as Record<string, any>).clips[0] as Record<string, any>).track).toBe('video');
    expect(() => parseShotComposition(updated)).not.toThrow();
  });

  it('updates only the targeted occurrence sharing a child revision and checks its blocker atomically', async () => {
    const graph = parseShotComposition(fixture);
    const updated = await updateCanonicalShotTimeline(graph, 'occ-1', {
      tracks: [{ id: 'video', kind: 'visual' }],
      clips: [{ id: 'shared-content', clip_type: 'media', track: 'video', at: 0, hold: 3.5 }],
    });
    const first = updated.occurrences.find((candidate) => candidate.occurrence_id === 'occ-1');
    const linked = updated.occurrences.find((candidate) => candidate.occurrence_id === 'occ-2');

    expect(first).toMatchObject({ duration_ms: 3500 });
    expect(first?.shot_id).not.toBe('shot-alpha');
    expect(linked).toMatchObject({ duration_ms: 2000, revision_id: 'rev-a' });
    expect(linked?.shot_id).toBe('shot-alpha');
    await expect(updateCanonicalShotTimeline(graph, 'occ-1', {
      tracks: [{ id: 'video', kind: 'visual' }],
      clips: [{ id: 'blocked-shared-content', clip_type: 'media', track: 'video', at: 0, hold: 5 }],
    })).rejects.toThrow('next shot');
  });

  it('derives extent from active audio/video/effect content and allows a contentless zero duration', () => {
    expect(timelineContentExtentMs({
      clips: [
        { id: 'disabled', at_ms: 0, duration_ms: 900, enabled: false },
        { id: 'audio', track: 'audio', at: 0.5, hold: 1.25, speed: 2 },
        { id: 'effect', clip_type: 'effect-layer', at_ms: 2200, duration_ms: 400 },
      ],
    })).toBe(2600);
    expect(timelineContentExtentMs({
      clips: [{ id: 'speed-aware', track: 'video', at: 0, duration_ms: 2000, speed: 2 }],
    })).toBe(1000);
    expect(timelineContentExtentMs({ clips: [{ id: 'gap', clip_type: 'gap', at_ms: 0, duration_ms: 900 }] }))
      .toBe(0);
    expect(timelineOccurrenceEffectiveDurationMs(
      { occurrence_id: 'b1b0', at_ms: 7067, track: 'picture' },
      [
        { occurrence_id: 'b1b0', at_ms: 7067, track: 'picture' },
        { occurrence_id: 'ed3b', at_ms: 10267, track: 'picture' },
      ],
      4467,
    )).toBe(3200);
  });

  it('grows and shrinks at the next same-lane hard blocker', async () => {
    const graph = parseShotComposition(fixture);
    const updated = await updateCanonicalShotTimeline(graph, 'occ-1', {
      tracks: [{ id: 'video', kind: 'visual' }],
      clips: [{ id: 'alpha-video', clip_type: 'media', track: 'video', at: 1.5, hold: 2 }],
    });
    expect(updated.occurrences.find((candidate) => candidate.occurrence_id === 'occ-1')?.duration_ms).toBe(3500);
    expect(updated.shot_revisions.find((revision) => revision.revision_id === updated.occurrences[0]?.revision_id)?.timing)
      .toMatchObject({ duration_ms: 3500 });

    const shrunk = await updateCanonicalShotTimeline(updated, 'occ-1', {
      tracks: [{ id: 'video', kind: 'visual' }],
      clips: [{ id: 'alpha-video', clip_type: 'media', track: 'video', at: 0, hold: 0.75 }],
    });
    expect(shrunk.occurrences.find((candidate) => candidate.occurrence_id === 'occ-1')?.duration_ms).toBe(750);

    expect(hardDurationMs(graph, 'occ-1')).toBe(4000);
    expect(hardDurationMs(graph, 'occ-1', 2000)).toBe(2000);

    await expect(updateCanonicalShotTimeline(graph, 'occ-1', {
      tracks: [{ id: 'video', kind: 'visual' }],
      clips: [{ id: 'alpha-video', clip_type: 'media', track: 'video', at: 3.5, hold: 1 }],
    })).rejects.toThrow('next shot');

    const differentLane = parseShotComposition({
      ...fixture,
      occurrences: fixture.occurrences.map((occurrence, index) => (
        index === 1 ? { ...occurrence, track: 'audio' } : occurrence
      )),
    });
    await expect(updateCanonicalShotTimeline(differentLane, 'occ-1', {
      tracks: [{ id: 'video', kind: 'visual' }],
      clips: [{ id: 'alpha-video', clip_type: 'media', track: 'video', at: 6.5, hold: 1 }],
    })).resolves.toBeDefined();
  });

  it('rejects a moved occurrence that overlaps a same-lane blocker but accepts a half-open edge', () => {
    const graph = parseShotComposition(fixture);
    expect(() => moveCanonicalOccurrence(graph, { occurrenceId: 'occ-1', atMs: 3000 }))
      .toThrow('same-lane blocker');
    expect(moveCanonicalOccurrence(graph, { occurrenceId: 'occ-1', atMs: 2000 })
      .occurrences.find((candidate) => candidate.occurrence_id === 'occ-1'))
      .toMatchObject({ at_ms: 2000, placement: { start_ms: 2000 } });

    const contentless = updateCanonicalShotTimeline(graph, 'occ-1', {
      tracks: [{ id: 'video', kind: 'visual' }],
      clips: [],
    });
    return expect(contentless).resolves.toMatchObject({
      occurrences: expect.arrayContaining([expect.objectContaining({ occurrence_id: 'occ-1', duration_ms: 0 })]),
    });
  });

  it('replaces only the explicit admitted media selection through a new child revision', async () => {
    const graph = parseShotComposition(fixture);
    const replacement = {
      asset_id: 'beta-image-replacement',
      object_id: 'object-beta-image-replacement',
      digest: `sha256:${'f'.repeat(64)}`,
      scope: { project_id: 'project-001', shot_id: 'shot-beta' },
      role: 'source',
    };
    const updated = await replaceCanonicalMedia(graph, 'occ-4', {
      fromAssetId: 'beta-image',
      assetId: 'beta-image-replacement',
      asset: replacement,
    });
    const occurrence = updated.occurrences.find((candidate) => candidate.occurrence_id === 'occ-4');
    const revision = updated.shot_revisions.find((candidate) => candidate.revision_id === occurrence?.revision_id);
    const internal = revision?.internal_timeline_revision as Record<string, any>;
    expect(occurrence?.revision_id).not.toBe('rev-a');
    expect(internal.timeline.clips[0]).toMatchObject({ asset_id: 'beta-image-replacement' });
    expect(revision?.assets).toContainEqual(expect.objectContaining({
      asset_id: 'beta-image-replacement',
      object_id: 'object-beta-image-replacement',
    }));
    expect(() => parseShotComposition(updated)).not.toThrow();
  });

  it('rejects replacement when the target was not explicitly admitted', async () => {
    const graph = parseShotComposition(fixture);
    await expect(replaceCanonicalMedia(graph, 'occ-4', {
      fromAssetId: 'beta-image',
      assetId: 'not-admitted',
    })).rejects.toThrow('not admitted');
  });
});
