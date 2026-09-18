import { describe, expect, it } from 'vitest';
import fixture from './shotComposition.fixture.json';
import {
  CanonicalShotCompositionHistory,
  duplicateIndependentShot,
  duplicateLinkedOccurrence,
  moveCanonicalOccurrence,
  trimCanonicalOccurrence,
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
});
