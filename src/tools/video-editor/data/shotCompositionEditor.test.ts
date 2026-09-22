import { describe, expect, it } from 'vitest';
import fixture from './shotComposition.fixture.json';
import {
  CanonicalShotCompositionHistory,
  duplicateIndependentShot,
  duplicateLinkedOccurrence,
  moveCanonicalOccurrence,
  trimCanonicalOccurrence,
  updateCanonicalShotSettings,
} from './shotCompositionEditor.ts';
import { parseShotComposition } from './shotComposition.ts';

describe('canonical shot-composition editor operations', () => {
  it('moves and trims an occurrence without changing its pinned revision identity', () => {
    const graph = parseShotComposition(fixture);
    const moved = moveCanonicalOccurrence(graph, { occurrenceId: 'occ-1', atMs: 1500 });
    const trimmed = trimCanonicalOccurrence(moved, { occurrenceId: 'occ-1', durationMs: 1800 });
    const occurrence = trimmed.occurrences.find((candidate) => candidate.occurrence_id === 'occ-1');

    expect(occurrence).toMatchObject({
      shot_id: 'shot-alpha',
      revision_id: 'rev-a',
      at_ms: 1500,
      duration_ms: 1800,
    });
    expect(occurrence?.stable_deep_link).toContain('/shot/shot-alpha/revision/rev-a/occurrence/occ-1');
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

  it('publishes shot settings as a new immutable revision for every linked occurrence', async () => {
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
    expect(linked?.revision_id).toBe(first?.revision_id);
    expect(oldRevision).toBeDefined();
    expect(newRevision).toMatchObject({
      shot_id: 'shot-alpha',
      settings: { generationMode: 'timeline', prompt: 'A revised prompt' },
    });
    expect(newRevision?.content_digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(updated.primary_timeline.head.revision_id).not.toBe('timeline-rev-2');
    expect(() => parseShotComposition(updated)).not.toThrow();
  });
});
