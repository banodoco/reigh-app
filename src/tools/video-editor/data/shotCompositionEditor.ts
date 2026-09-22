import {
  stableOccurrenceDeepLink,
  stableOutputIdentity,
  type ShotCompositionContract,
} from './shotComposition.ts';

type JsonObject = Record<string, unknown>;

const canonicalPublishQueues = new Map<string, Promise<unknown>>();

/** Serialize all canonical edits for one project/timeline CAS head. */
export function enqueueCanonicalShotPublish<T>(
  projectId: string,
  parentDocumentId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const key = `${projectId}\u0000${parentDocumentId}`;
  const previous = canonicalPublishQueues.get(key);
  const queued = previous
    ? previous.catch(() => {}).then(operation)
    : operation();
  canonicalPublishQueues.set(key, queued);
  void queued.then(
    () => {
      if (canonicalPublishQueues.get(key) === queued) canonicalPublishQueues.delete(key);
    },
    () => {
      if (canonicalPublishQueues.get(key) === queued) canonicalPublishQueues.delete(key);
    },
  );
  return queued;
}

export type CanonicalOccurrenceEdit = Readonly<{
  occurrenceId: string;
  atMs?: number;
  durationMs?: number;
}>;

export type CanonicalShotRevisionPatch = Readonly<{
  settings?: JsonObject;
  provenance?: JsonObject;
  timeline?: JsonObject;
}>;

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as JsonObject)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

async function digestJson(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(value));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function newIdentity(prefix: string): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`}`;
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

function revisionPayload(revision: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(revision).filter(([key]) => ![
    'shot_id',
    'revision_id',
    'document_role',
    'content_digest',
    'internal_timeline_revision',
  ].includes(key)));
}

function internalTimelinePayload(internal: JsonObject): JsonObject {
  return Object.fromEntries(Object.entries(internal).filter(([key]) => ![
    'revision_id',
    'content_digest',
    'publish',
  ].includes(key)));
}

function record(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

/**
 * Create an immutable child revision for an editor-level shot change.
 *
 * Shot occurrences pin immutable revisions. Updating the old revision in place
 * makes Runtime reject the publication as an identity reuse, so a shot edit
 * gets a new revision and every occurrence that shared the old revision is
 * advanced to it. The old revision remains in the graph for history and for
 * any older composition that still references it.
 */
export async function updateCanonicalShotRevision(
  graph: ShotCompositionContract,
  occurrenceId: string,
  patch: CanonicalShotRevisionPatch,
): Promise<ShotCompositionContract> {
  const next = clone(graph);
  const occurrenceIndex = next.occurrences.findIndex((occurrence) => occurrence.occurrence_id === occurrenceId);
  if (occurrenceIndex < 0) throw new Error(`canonical occurrence ${occurrenceId} is missing`);

  const sourceOccurrence = next.occurrences[occurrenceIndex];
  const sourceRevisionIndex = next.shot_revisions.findIndex((revision) => (
    revision.shot_id === sourceOccurrence.shot_id
    && revision.revision_id === sourceOccurrence.revision_id
  ));
  if (sourceRevisionIndex < 0) throw new Error(`canonical shot revision ${sourceOccurrence.shot_id}/${sourceOccurrence.revision_id} is missing`);

  const sourceRevision = next.shot_revisions[sourceRevisionIndex];
  const revisionId = newIdentity(`shot-revision-${String(sourceOccurrence.shot_id)}`);
  const sourceInternal = record(sourceRevision.internal_timeline_revision);
  if (!sourceInternal) throw new Error('canonical shot revision internal timeline is missing');
  const updatedInternal = patch.timeline
    ? {
        ...sourceInternal,
        revision_id: newIdentity(`timeline-${String(sourceOccurrence.shot_id)}`),
        publish: true,
        timeline: clone(patch.timeline),
      }
    : undefined;
  const updatedRevision: JsonObject = {
    ...sourceRevision,
    revision_id: revisionId,
    publish: true,
    ...(patch.settings ? { settings: clone(patch.settings) } : {}),
    ...(patch.provenance ? { provenance: clone(patch.provenance) } : {}),
    ...(updatedInternal ? { internal_timeline_revision: updatedInternal } : {}),
  };
  if (updatedInternal) {
    updatedInternal.content_digest = await digestJson(internalTimelinePayload(updatedInternal));
  }
  updatedRevision.content_digest = await digestJson(revisionPayload(updatedRevision));
  // Keep the source revision in the graph. Runtime revisions are immutable;
  // the new revision is appended as a child rather than replacing history.
  next.shot_revisions.push(updatedRevision);

  for (const [index, occurrence] of next.occurrences.entries()) {
    if (occurrence.shot_id !== sourceOccurrence.shot_id || occurrence.revision_id !== sourceOccurrence.revision_id) continue;
    next.occurrences[index] = withOccurrenceIdentity(next, {
      ...occurrence,
      revision_id: revisionId,
    }, String(occurrence.occurrence_id));
  }

  const parentComposition = record(next.parent_composition);
  if (parentComposition && Array.isArray(parentComposition.occurrences)) {
    const parentOccurrences = parentComposition.occurrences.map((rawOccurrence) => {
      const occurrence = record(rawOccurrence);
      const occurrenceRevisionId = occurrence?.revision_id ?? occurrence?.shot_revision_id;
      if (!occurrence || occurrence.shot_id !== sourceOccurrence.shot_id || occurrenceRevisionId !== sourceOccurrence.revision_id) {
        return rawOccurrence;
      }
      return { ...occurrence, revision_id: revisionId, shot_revision_id: revisionId };
    });
    next.parent_composition = { ...parentComposition, occurrences: parentOccurrences };
  }

  const nextHeadRevisionId = newIdentity('composition-revision');
  const nextParentPayload = record(next.parent_composition) ?? { occurrences: next.occurrences };
  const primaryTimeline = record(next.primary_timeline);
  const head = primaryTimeline ? record(primaryTimeline.head) : null;
  if (!primaryTimeline || !head) throw new Error('canonical primary timeline head is missing');
  next.primary_timeline = {
    ...primaryTimeline,
    head: {
      ...head,
      revision_id: nextHeadRevisionId,
      content_digest: await digestJson(nextParentPayload),
    },
  };

  const cases = record(next.cases);
  const staleWrite = cases ? record(cases.stale_write_rejection) : null;
  if (cases && staleWrite) {
    next.cases = {
      ...cases,
      stale_write_rejection: {
        ...staleWrite,
        submitted_head_revision_id: nextHeadRevisionId,
      },
    };
  }

  return next;
}

export function updateCanonicalShotSettings(
  graph: ShotCompositionContract,
  occurrenceId: string,
  settings: JsonObject,
): Promise<ShotCompositionContract> {
  return updateCanonicalShotRevision(graph, occurrenceId, { settings });
}

export function updateCanonicalShotTimeline(
  graph: ShotCompositionContract,
  occurrenceId: string,
  timeline: JsonObject,
): Promise<ShotCompositionContract> {
  return updateCanonicalShotRevision(graph, occurrenceId, { timeline });
}

export function updateCanonicalShotName(
  graph: ShotCompositionContract,
  occurrenceId: string,
  name: string,
): Promise<ShotCompositionContract> {
  const occurrence = graph.occurrences.find((candidate) => candidate.occurrence_id === occurrenceId);
  if (!occurrence) throw new Error(`canonical occurrence ${occurrenceId} is missing`);
  const revision = graph.shot_revisions.find((candidate) => (
    candidate.shot_id === occurrence.shot_id && candidate.revision_id === occurrence.revision_id
  ));
  const provenance = record(revision?.provenance) ?? {};
  return updateCanonicalShotRevision(graph, occurrenceId, {
    provenance: { ...provenance, name },
  });
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
  independentRevision.publish = true;
  const internal = independentRevision.internal_timeline_revision as JsonObject;
  independentRevision.internal_timeline_revision = { ...internal, revision_id: ids.internalTimelineRevisionId, publish: true };
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
