import {
  stableOccurrenceDeepLink,
  stableOutputIdentity,
  type ShotCompositionContract,
} from './shotComposition.ts';

type JsonObject = Record<string, unknown>;

export type CanonicalOccurrenceEdit = Readonly<{
  occurrenceId: string;
  atMs?: number;
  durationMs?: number;
}>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

function occurrenceIndex(graph: ShotCompositionContract, occurrenceId: string): number {
  const index = graph.occurrences.findIndex((occurrence) => occurrence.occurrence_id === occurrenceId);
  if (index < 0) throw new Error(`canonical occurrence ${occurrenceId} is missing`);
  return index;
}

function withOccurrenceIdentity(
  graph: ShotCompositionContract,
  occurrence: JsonObject,
  occurrenceId: string,
): JsonObject {
  const projectId = String(graph.project.project_id);
  const documentId = String(graph.project.document_id);
  const shotId = String(occurrence.shot_id);
  const revisionId = String(occurrence.revision_id);
  return {
    ...occurrence,
    occurrence_id: occurrenceId,
    stable_deep_link: stableOccurrenceDeepLink(projectId, documentId, shotId, revisionId, occurrenceId),
    output_identity: stableOutputIdentity(projectId, documentId, occurrenceId),
  };
}

function reorderOccurrences(graph: ShotCompositionContract): ShotCompositionContract {
  const occurrences = graph.occurrences
    .map((occurrence, index) => ({ occurrence, index }))
    .sort((left, right) => (
      Number(left.occurrence.at_ms) - Number(right.occurrence.at_ms)
      || Number(left.occurrence.ordinal) - Number(right.occurrence.ordinal)
      || left.index - right.index
    ))
    .map(({ occurrence }, ordinal) => ({ ...occurrence, ordinal }));
  return { ...graph, occurrences };
}

export function moveCanonicalOccurrence(
  graph: ShotCompositionContract,
  edit: Pick<CanonicalOccurrenceEdit, 'occurrenceId' | 'atMs'>,
): ShotCompositionContract {
  const atMs = requireNonNegativeInteger(edit.atMs ?? 0, 'atMs');
  const next = clone(graph);
  const index = occurrenceIndex(next, edit.occurrenceId);
  next.occurrences[index] = { ...next.occurrences[index], at_ms: atMs };
  return reorderOccurrences(next);
}

export function trimCanonicalOccurrence(
  graph: ShotCompositionContract,
  edit: Pick<CanonicalOccurrenceEdit, 'occurrenceId' | 'durationMs'>,
): ShotCompositionContract {
  const durationMs = requireNonNegativeInteger(edit.durationMs ?? 0, 'durationMs');
  if (durationMs === 0) throw new Error('durationMs must be greater than zero');
  const next = clone(graph);
  const index = occurrenceIndex(next, edit.occurrenceId);
  next.occurrences[index] = { ...next.occurrences[index], duration_ms: durationMs };
  return next;
}

export function duplicateLinkedOccurrence(
  graph: ShotCompositionContract,
  sourceOccurrenceId: string,
  destinationOccurrenceId: string,
): ShotCompositionContract {
  if (graph.occurrences.some((occurrence) => occurrence.occurrence_id === destinationOccurrenceId)) {
    throw new Error(`canonical occurrence ${destinationOccurrenceId} already exists`);
  }
  const source = graph.occurrences[occurrenceIndex(graph, sourceOccurrenceId)];
  const next = clone(graph);
  next.occurrences.push(withOccurrenceIdentity(next, source, destinationOccurrenceId));
  return reorderOccurrences(next);
}

export function duplicateIndependentShot(
  graph: ShotCompositionContract,
  sourceOccurrenceId: string,
  ids: Readonly<{ shotId: string; revisionId: string; internalTimelineRevisionId: string; occurrenceId: string }>,
): ShotCompositionContract {
  const next = clone(graph);
  const sourceOccurrence = next.occurrences[occurrenceIndex(next, sourceOccurrenceId)];
  if (next.occurrences.some((occurrence) => occurrence.occurrence_id === ids.occurrenceId)) {
    throw new Error(`canonical occurrence ${ids.occurrenceId} already exists`);
  }
  if (next.shot_revisions.some((revision) => revision.shot_id === ids.shotId && revision.revision_id === ids.revisionId)) {
    throw new Error(`canonical revision ${ids.shotId}/${ids.revisionId} already exists`);
  }
  const sourceRevision = next.shot_revisions.find((revision) => (
    revision.shot_id === sourceOccurrence.shot_id && revision.revision_id === sourceOccurrence.revision_id
  ));
  if (!sourceRevision) throw new Error('source shot revision is missing');
  const independentRevision = clone(sourceRevision);
  independentRevision.shot_id = ids.shotId;
  independentRevision.revision_id = ids.revisionId;
  const internal = independentRevision.internal_timeline_revision as JsonObject;
  independentRevision.internal_timeline_revision = { ...internal, revision_id: ids.internalTimelineRevisionId };
  next.shot_revisions.push(independentRevision);
  next.occurrences.push(withOccurrenceIdentity(next, {
    ...sourceOccurrence,
    shot_id: ids.shotId,
    revision_id: ids.revisionId,
  }, ids.occurrenceId));
  return reorderOccurrences(next);
}

export class CanonicalShotCompositionHistory {
  private readonly past: ShotCompositionContract[] = [];
  private readonly future: ShotCompositionContract[] = [];

  constructor(private current: ShotCompositionContract) {}

  get value(): ShotCompositionContract {
    return this.current;
  }

  commit(next: ShotCompositionContract): ShotCompositionContract {
    this.past.push(this.current);
    this.current = next;
    this.future.length = 0;
    return this.current;
  }

  undo(): ShotCompositionContract {
    const previous = this.past.pop();
    if (!previous) return this.current;
    this.future.push(this.current);
    this.current = previous;
    return this.current;
  }

  redo(): ShotCompositionContract {
    const next = this.future.pop();
    if (!next) return this.current;
    this.past.push(this.current);
    this.current = next;
    return this.current;
  }
}
