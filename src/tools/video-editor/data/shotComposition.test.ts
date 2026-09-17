import { describe, expect, it } from 'vitest';

import fixture from './shotComposition.fixture.json';
import {
  assertExpectedHead,
  parseShotComposition,
  ShotCompositionValidationError,
  StaleWriteError,
  stableOccurrenceDeepLink,
  stableOutputIdentity,
} from './shotComposition.ts';

const cloneFixture = () => JSON.parse(JSON.stringify(fixture)) as Record<string, unknown>;

describe('shot-composition contract', () => {
  it('preserves repeated linked occurrences, pinned revisions, and scoped inputs', () => {
    const contract = parseShotComposition(fixture);
    const occurrences = contract.occurrences;
    const revisions = new Set(contract.shot_revisions.map((revision) => `${revision.shot_id}:${revision.revision_id}`));

    expect(occurrences).toHaveLength(5);
    expect(`${occurrences[0].shot_id}:${occurrences[0].revision_id}`).toBe('shot-alpha:rev-a');
    expect(`${occurrences[1].shot_id}:${occurrences[1].revision_id}`).toBe('shot-alpha:rev-a');
    expect(occurrences[0].occurrence_id).not.toBe(occurrences[1].occurrence_id);
    expect(revisions).toEqual(new Set(['shot-beta:rev-a', 'shot-alpha:rev-a', 'shot-alpha:rev-b', 'shot-alpha-copy:rev-a']));
    expect(occurrences[4].shot_id).toBe('shot-alpha-copy');
    expect(occurrences[4].stable_deep_link).not.toBe(occurrences[0].stable_deep_link);
    expect(occurrences[4].output_identity).not.toBe(occurrences[0].output_identity);
    expect(occurrences[0].output_identity).not.toBe(occurrences[1].output_identity);
    expect(occurrences[0].stable_deep_link).toBe(stableOccurrenceDeepLink('project-001', 'document-primary', 'shot-alpha', 'rev-a', 'occ-1'));
    expect(occurrences[0].output_identity).toBe(stableOutputIdentity('project-001', 'document-primary', 'occ-1'));

    const alpha = contract.shot_revisions.find((revision) => revision.shot_id === 'shot-alpha' && revision.revision_id === 'rev-a');
    expect(alpha?.timing).toEqual({ duration_ms: 2000 });
    expect((alpha?.audio as Record<string, unknown>).scope).toEqual({ project_id: 'project-001' });
    expect((alpha?.provenance as Record<string, unknown>).source).toBe('travel-between-images');
    expect((alpha?.generation_inputs as Array<Record<string, unknown>>).map((input) => input.ordinal)).toEqual([0, 1]);
  });

  it('represents missing dependencies and rejects stale writes with 409', () => {
    const contract = parseShotComposition(fixture);
    const stale = contract.cases.stale_write_rejection as Record<string, unknown>;
    expect((contract.cases.missing_dependency as Record<string, unknown>).expected).toBe('missing_dependency');
    expect(stale.expected_status).toBe(409);
    expect(() => assertExpectedHead(stale.expected_head_revision_id as string, stale.submitted_head_revision_id as string)).toThrow(StaleWriteError);
    try {
      assertExpectedHead(stale.expected_head_revision_id as string, stale.submitted_head_revision_id as string);
    } catch (error) {
      expect(error).toMatchObject({ status: 409, code: 'stale_write' });
    }
  });

  it('rejects legacy group and shot clip shapes', () => {
    const legacyGroup = cloneFixture();
    legacyGroup.pinnedShotGroups = [];
    expect(() => parseShotComposition(legacyGroup)).toThrow(ShotCompositionValidationError);

    const legacyClip = cloneFixture();
    const revisions = legacyClip.shot_revisions as Array<Record<string, unknown>>;
    const internal = revisions[0].internal_timeline_revision as Record<string, unknown>;
    const timeline = internal.timeline as Record<string, unknown>;
    const clips = timeline.clips as Array<Record<string, unknown>>;
    clips[0].clipType = 'shot';
    expect(() => parseShotComposition(legacyClip)).toThrow(/migration-only/);
  });
});
