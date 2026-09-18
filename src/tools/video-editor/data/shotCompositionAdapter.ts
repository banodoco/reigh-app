import {
  parseShotComposition,
  StaleWriteError,
  type ShotCompositionContract,
} from './shotComposition.ts';

type JsonObject = Record<string, unknown>;

export type ShotCompositionReadRequest = Readonly<{
  projectId: string;
  parentDocumentId: string;
}>;

export type ShotCompositionPublishRequest = Readonly<{
  projectId: string;
  parentDocumentId: string;
  expectedHeadRevisionId: string;
  graph: ShotCompositionContract;
}>;

/**
 * Product-facing I/O port for the canonical graph.
 *
 * Runtime/bridge clients implement this port. The adapter never imports a
 * transport, Supabase client, or React provider, which keeps all graph tests
 * deterministic and makes the expected-head CAS explicit at the boundary.
 */
export interface ShotCompositionPort {
  load(request: ShotCompositionReadRequest): Promise<unknown>;
  publish?(request: ShotCompositionPublishRequest): Promise<unknown>;
}

export class ShotCompositionUnavailableError extends Error {
  readonly code = 'shot_composition_unavailable' as const;

  constructor(message = 'The canonical shot-composition graph is unavailable') {
    super(message);
    this.name = 'ShotCompositionUnavailableError';
  }
}

export type CanonicalShotOccurrence = Readonly<{
  occurrenceId: string;
  parentDocumentId: string;
  shotId: string;
  revisionId: string;
  ordinal: number;
  atMs: number;
  durationMs: number;
  stableDeepLink: string;
  outputIdentity: string;
  revision: JsonObject;
}>;

export type PreparedShotComposition = Readonly<{
  contract: ShotCompositionContract;
  projectId: string;
  parentDocumentId: string;
  headRevisionId: string;
  occurrences: readonly CanonicalShotOccurrence[];
}>;

function record(value: unknown, label: string): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ShotCompositionUnavailableError(`${label} is not an object`);
  }
  return value as JsonObject;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ShotCompositionUnavailableError(`${label} is missing`);
  }
  return value;
}

function requiredNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ShotCompositionUnavailableError(`${label} is invalid`);
  }
  return value;
}

function isConflict(error: unknown): boolean {
  return error instanceof Error
    && ('status' in error && (error as Error & { status?: unknown }).status === 409
      || 'statusCode' in error && (error as Error & { statusCode?: unknown }).statusCode === 409
      || 'code' in error && ['conflict', 'stale_write', 'document_version_conflict'].includes(
        String((error as Error & { code?: unknown }).code),
      ));
}

function prepareContract(contract: ShotCompositionContract): PreparedShotComposition {
  const project = record(contract.project, 'project');
  const primaryTimeline = record(contract.primary_timeline, 'primary_timeline');
  const head = record(primaryTimeline.head, 'primary_timeline.head');
  const projectId = requiredString(project.project_id, 'project.project_id');
  const parentDocumentId = requiredString(project.document_id, 'project.document_id');
  const headRevisionId = requiredString(head.revision_id, 'primary_timeline.head.revision_id');
  const revisions = new Map(
    contract.shot_revisions.map((revision) => [
      `${String(revision.shot_id)}\u0000${String(revision.revision_id)}`,
      revision,
    ]),
  );

  const occurrences = contract.occurrences
    .map((rawOccurrence) => {
      const occurrence = record(rawOccurrence, 'occurrence');
      const shotId = requiredString(occurrence.shot_id, 'occurrence.shot_id');
      const revisionId = requiredString(occurrence.revision_id, 'occurrence.revision_id');
      const revision = revisions.get(`${shotId}\u0000${revisionId}`);
      if (!revision) {
        throw new ShotCompositionUnavailableError(
          `occurrence ${String(occurrence.occurrence_id)} references a missing revision`,
        );
      }
      return Object.freeze({
        occurrenceId: requiredString(occurrence.occurrence_id, 'occurrence.occurrence_id'),
        parentDocumentId: requiredString(occurrence.parent_document_id, 'occurrence.parent_document_id'),
        shotId,
        revisionId,
        ordinal: requiredNumber(occurrence.ordinal, 'occurrence.ordinal'),
        atMs: requiredNumber(occurrence.at_ms, 'occurrence.at_ms'),
        durationMs: requiredNumber(occurrence.duration_ms, 'occurrence.duration_ms'),
        stableDeepLink: requiredString(occurrence.stable_deep_link, 'occurrence.stable_deep_link'),
        outputIdentity: requiredString(occurrence.output_identity, 'occurrence.output_identity'),
        revision,
      });
    })
    .sort((left, right) => left.ordinal - right.ordinal);

  return Object.freeze({
    contract,
    projectId,
    parentDocumentId,
    headRevisionId,
    occurrences: Object.freeze(occurrences),
  });
}

export function createShotCompositionAdapter(port: ShotCompositionPort) {
  return {
    async load(request: ShotCompositionReadRequest): Promise<PreparedShotComposition> {
      try {
        return prepareContract(parseShotComposition(await port.load(request)));
      } catch (error) {
        if (error instanceof ShotCompositionUnavailableError) throw error;
        throw error;
      }
    },

    prepare(raw: unknown): PreparedShotComposition {
      return prepareContract(parseShotComposition(raw));
    },

    async publish(request: ShotCompositionPublishRequest): Promise<PreparedShotComposition> {
      if (!port.publish) {
        throw new ShotCompositionUnavailableError('The canonical shot-composition provider is read-only');
      }
      // Validate the submitted graph before crossing the port. The submitted
      // graph may advance the head; expectedHeadRevisionId is the old head the
      // Runtime must compare-and-swap against.
      prepareContract(parseShotComposition(request.graph));
      requiredString(request.expectedHeadRevisionId, 'expectedHeadRevisionId');
      try {
        const published = await port.publish(request);
        return prepareContract(parseShotComposition(published));
      } catch (error) {
        if (error instanceof StaleWriteError) throw error;
        if (isConflict(error)) {
          const detail = error instanceof Error ? error.message : String(error);
          throw new StaleWriteError(`stale shot-composition write: ${detail}`);
        }
        throw error;
      }
    },
  };
}

export type ShotCompositionAdapter = ReturnType<typeof createShotCompositionAdapter>;
