/** Canonical T1 shot-composition wire contract.
 *
 * This validator is intentionally pure. workspace.v1 currently has no
 * operation that resolves an immutable revision by id or CAS-publishes a
 * parent head, so this module does not add a network fallback or route.
 */

export const SHOT_COMPOSITION_SCHEMA_VERSION = 1 as const;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

type JsonObject = Record<string, unknown>;

export interface ShotCompositionContract extends JsonObject {
  schema_version: 1;
  project: JsonObject;
  primary_timeline: JsonObject;
  shot_revisions: JsonObject[];
  occurrences: JsonObject[];
  cases: JsonObject;
}

export class ShotCompositionValidationError extends Error {
  readonly code = 'shot_composition_invalid' as const;
  constructor(message: string) {
    super(message);
    this.name = 'ShotCompositionValidationError';
  }
}

export class StaleWriteError extends Error {
  readonly code = 'stale_write' as const;
  readonly status = 409 as const;
  constructor(message: string) {
    super(message);
    this.name = 'StaleWriteError';
  }
}

function fail(path: string, message: string): never {
  throw new ShotCompositionValidationError(`${path}: ${message}`);
}

function object(value: unknown, path: string): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'must be an object');
  return value as JsonObject;
}

function string(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(path, 'must be a non-empty string');
  return value;
}

function nonNegativeInteger(value: unknown, path: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) fail(path, 'must be a non-negative integer');
  return value as number;
}

function digest(value: unknown, path: string): string {
  const result = string(value, path);
  if (!DIGEST.test(result)) fail(path, 'must be a sha256 digest');
  return result;
}

function rejectLegacy(value: unknown, path = 'contract'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => rejectLegacy(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== 'object' || value === null) return;
  const record = value as JsonObject;
  if ('pinnedShotGroups' in record) fail(path, 'pinnedShotGroups is migration-only');
  if (record.clipType === 'shot') fail(path, 'clipType=shot is migration-only');
  Object.entries(record).forEach(([key, child]) => rejectLegacy(child, `${path}.${key}`));
}

export function stableOccurrenceDeepLink(
  projectId: string,
  parentDocumentId: string,
  shotId: string,
  revisionId: string,
  occurrenceId: string,
): string {
  const [project, document, shot, revision, occurrence] = [
    projectId,
    parentDocumentId,
    shotId,
    revisionId,
    occurrenceId,
  ].map((value) => encodeURIComponent(string(value, 'deep_link')));
  return `project/${project}/document/${document}/shot/${shot}/revision/${revision}/occurrence/${occurrence}`;
}

export function stableOutputIdentity(projectId: string, parentDocumentId: string, occurrenceId: string): string {
  const [project, document, occurrence] = [projectId, parentDocumentId, occurrenceId]
    .map((value) => encodeURIComponent(string(value, 'output_identity')));
  return `project/${project}/document/${document}/occurrence/${occurrence}/output/final-video`;
}

/** Local contract guard only; Runtime CAS publication remains unproven. */
export function assertExpectedHead(expectedRevisionId: string, actualRevisionId: string): void {
  if (expectedRevisionId !== actualRevisionId) {
    throw new StaleWriteError(`stale shot-composition head: expected ${expectedRevisionId}, actual ${actualRevisionId}`);
  }
}

export function validateShotComposition(raw: unknown): ShotCompositionContract {
  rejectLegacy(raw);
  const root = object(raw, 'contract');
  if (root.schema_version !== SHOT_COMPOSITION_SCHEMA_VERSION) fail('schema_version', 'must be 1');
  const project = object(root.project, 'project');
  const projectId = string(project.project_id, 'project.project_id');
  const documentId = string(project.document_id, 'project.document_id');
  if (project.role !== 'project') fail('project.role', 'must be project');
  const primary = object(root.primary_timeline, 'primary_timeline');
  if (primary.role !== 'primary_timeline') fail('primary_timeline.role', 'must be primary_timeline');
  if (primary.document_id !== documentId) fail('primary_timeline.document_id', 'must match project.document_id');
  const head = object(primary.head, 'primary_timeline.head');
  const headRevisionId = string(head.revision_id, 'primary_timeline.head.revision_id');
  digest(head.content_digest, 'primary_timeline.head.content_digest');

  if (!Array.isArray(root.shot_revisions) || root.shot_revisions.length === 0) fail('shot_revisions', 'must be a non-empty list');
  const revisions = new Map<string, JsonObject>();
  root.shot_revisions.forEach((rawRevision, index) => {
    const path = `shot_revisions[${index}]`;
    const revision = object(rawRevision, path);
    const shotId = string(revision.shot_id, `${path}.shot_id`);
    const revisionId = string(revision.revision_id, `${path}.revision_id`);
    const key = `${shotId}\u0000${revisionId}`;
    if (revisions.has(key)) fail(path, 'duplicate shot/revision identity');
    revisions.set(key, revision);
    if (revision.document_role !== 'shot_revision') fail(`${path}.document_role`, 'must be shot_revision');
    digest(revision.content_digest, `${path}.content_digest`);
    const internal = object(revision.internal_timeline_revision, `${path}.internal_timeline_revision`);
    string(internal.revision_id, `${path}.internal_timeline_revision.revision_id`);
    digest(internal.content_digest, `${path}.internal_timeline_revision.content_digest`);
    const timeline = object(internal.timeline, `${path}.internal_timeline_revision.timeline`);
    if (!Array.isArray(timeline.tracks) || !Array.isArray(timeline.clips)) fail(`${path}.internal_timeline_revision.timeline`, 'tracks and clips must be lists');
    const timing = object(revision.timing, `${path}.timing`);
    nonNegativeInteger(timing.duration_ms, `${path}.timing.duration_ms`);
    const audio = object(revision.audio, `${path}.audio`);
    string(audio.track_id, `${path}.audio.track_id`);
    string(audio.object_id, `${path}.audio.object_id`);
    digest(audio.digest, `${path}.audio.digest`);
    if (object(audio.scope, `${path}.audio.scope`).project_id !== projectId) fail(`${path}.audio.scope.project_id`, 'must match project.project_id');
    if (!Array.isArray(revision.assets)) fail(`${path}.assets`, 'must be a list');
    revision.assets.forEach((rawAsset, assetIndex) => {
      const assetPath = `${path}.assets[${assetIndex}]`;
      const asset = object(rawAsset, assetPath);
      string(asset.asset_id, `${assetPath}.asset_id`);
      string(asset.object_id, `${assetPath}.object_id`);
      digest(asset.digest, `${assetPath}.digest`);
      string(asset.role, `${assetPath}.role`);
      if (object(asset.scope, `${assetPath}.scope`).project_id !== projectId) fail(`${assetPath}.scope.project_id`, 'must match project.project_id');
    });
    if (!Array.isArray(revision.generation_inputs)) fail(`${path}.generation_inputs`, 'must be a list');
    const ordinals = revision.generation_inputs.map((rawInput, inputIndex) => {
      const inputPath = `${path}.generation_inputs[${inputIndex}]`;
      const input = object(rawInput, inputPath);
      string(input.input_id, `${inputPath}.input_id`);
      string(input.object_id, `${inputPath}.object_id`);
      digest(input.digest, `${inputPath}.digest`);
      string(input.role, `${inputPath}.role`);
      return nonNegativeInteger(input.ordinal, `${inputPath}.ordinal`);
    });
    if (ordinals.some((ordinal, ordinalIndex) => ordinal !== ordinalIndex)) fail(`${path}.generation_inputs`, 'ordinals must be contiguous and ordered');
    if (typeof revision.provenance !== 'object' || revision.provenance === null || Array.isArray(revision.provenance)) fail(`${path}.provenance`, 'must be an object');
  });
  root.shot_revisions.forEach((rawRevision, index) => {
    const revision = object(rawRevision, `shot_revisions[${index}]`);
    if (!Array.isArray(revision.dependencies)) fail(`shot_revisions[${index}].dependencies`, 'must be a list');
    revision.dependencies.forEach((rawDependency, dependencyIndex) => {
      const path = `shot_revisions[${index}].dependencies[${dependencyIndex}]`;
      const dependency = object(rawDependency, path);
      const key = `${string(dependency.shot_id, `${path}.shot_id`)}\u0000${string(dependency.revision_id, `${path}.revision_id`)}`;
      if (!revisions.has(key)) fail(path, 'dependency revision is missing');
      if (typeof dependency.required !== 'boolean') fail(`${path}.required`, 'must be boolean');
    });
  });

  if (!Array.isArray(root.occurrences) || root.occurrences.length === 0) fail('occurrences', 'must be a non-empty list');
  const occurrenceIds = new Set<string>();
  root.occurrences.forEach((rawOccurrence, index) => {
    const path = `occurrences[${index}]`;
    const occurrence = object(rawOccurrence, path);
    const occurrenceId = string(occurrence.occurrence_id, `${path}.occurrence_id`);
    if (occurrenceIds.has(occurrenceId)) fail(path, 'duplicate occurrence_id');
    occurrenceIds.add(occurrenceId);
    if (occurrence.parent_document_id !== documentId) fail(`${path}.parent_document_id`, 'must match primary timeline');
    const shotId = string(occurrence.shot_id, `${path}.shot_id`);
    const revisionId = string(occurrence.revision_id, `${path}.revision_id`);
    if (!revisions.has(`${shotId}\u0000${revisionId}`)) fail(path, 'occurrence must pin an available shot revision');
    nonNegativeInteger(occurrence.ordinal, `${path}.ordinal`);
    nonNegativeInteger(occurrence.at_ms, `${path}.at_ms`);
    nonNegativeInteger(occurrence.duration_ms, `${path}.duration_ms`);
    if (occurrence.stable_deep_link !== stableOccurrenceDeepLink(projectId, documentId, shotId, revisionId, occurrenceId)) fail(`${path}.stable_deep_link`, 'does not match pinned identity');
    if (occurrence.output_identity !== stableOutputIdentity(projectId, documentId, occurrenceId)) fail(`${path}.output_identity`, 'must be occurrence-qualified');
  });

  const cases = object(root.cases, 'cases');
  const missing = object(cases.missing_dependency, 'cases.missing_dependency');
  string(missing.shot_id, 'cases.missing_dependency.shot_id');
  string(missing.revision_id, 'cases.missing_dependency.revision_id');
  if (missing.expected !== 'missing_dependency') fail('cases.missing_dependency.expected', 'must be missing_dependency');
  const stale = object(cases.stale_write_rejection, 'cases.stale_write_rejection');
  string(stale.expected_head_revision_id, 'cases.stale_write_rejection.expected_head_revision_id');
  string(stale.submitted_head_revision_id, 'cases.stale_write_rejection.submitted_head_revision_id');
  if (stale.expected_status !== 409) fail('cases.stale_write_rejection.expected_status', 'must be 409');
  assertExpectedHead(headRevisionId, headRevisionId);
  return root as ShotCompositionContract;
}

export function parseShotComposition(raw: unknown): ShotCompositionContract {
  if (typeof raw === 'string') {
    try {
      return validateShotComposition(JSON.parse(raw) as unknown);
    } catch (error) {
      if (error instanceof ShotCompositionValidationError) throw error;
      throw new ShotCompositionValidationError('contract: invalid JSON');
    }
  }
  return validateShotComposition(raw);
}
