import { ApiError, type ByteResponse } from './generated.ts';
import {
  ReighRuntimeClient,
  RuntimeAuthenticationError,
  RuntimeUnavailableError,
  isRuntimeConflict,
  type RuntimeConnectorError,
} from './client.ts';
import {
  TimelineNotFoundError,
  TimelineSchemaIncompatibleError,
  TimelineVersionConflictError,
  type DataProvider,
  type LoadedTimeline,
  type LoadedReferencedTimeline,
  type UploadedAssetResult,
  type UploadAssetOptions,
} from '@/tools/video-editor/data/DataProvider.ts';
import type {
  AssetRegistry,
  AssetRegistryEntry,
  TimelineConfig,
} from '@/tools/video-editor/types/index.ts';
import type { GenerationRow } from '@/domains/generation/types/index.ts';
import type { Transport } from './generated.ts';
import type {
  AssetResolveRequest,
  AssetUploadRequest,
} from '@/tools/video-editor/data/AssetResolver.ts';
import type { TimelineBundleEnvelope } from '@/tools/video-editor/data/typed/timelineBundle.ts';
import { parseTimelineBundle } from '@/tools/video-editor/data/typed/timelineBundle.ts';
import { withDefaultTimelineOutput } from '@/tools/video-editor/lib/defaults.ts';
import {
  ShotCompositionUnavailableError,
  type ShotCompositionPort,
} from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import {
  assertExpectedHead,
  stableOccurrenceDeepLink,
  stableOutputIdentity,
  StaleWriteError,
} from '@/tools/video-editor/data/shotComposition.ts';
import { generateUUID } from '@/shared/lib/taskCreation/ids.ts';
import {
  runtimeThumbnailObjectId,
  selectRuntimePrimaryVariant,
} from './generationProjection.ts';
import { listAllRuntimeVariants } from './generationAccess.ts';

type RuntimeRecord = Record<string, unknown>;

export interface RuntimeDataProviderOptions {
  projectId: string;
  baseUrl?: string;
  /** Direct clients may pass a disposable test credential; browser callers use the connector. */
  token?: string;
  transport?: Transport;
  /** UI-only observation of connector failures; Runtime remains the IO authority. */
  onRuntimeError?: (error: RuntimeConnectorError) => void;
}

/**
 * Reigh's first neutral-runtime provider. It owns no storage: the generated
 * WorkspaceClient is the only IO authority, and the Runtime timeline document
 * is the single versioned config/registry record.
 */
export class RuntimeDataProvider implements DataProvider {
  readonly persistenceEnabled = true;
  readonly supportsEditorSync = false;
  readonly supportsDirectAssetUpload = true;
  /**
   * Runtime has no public timeline-document event cursor yet. Until that
   * contract exists, the consumer catches up through its canonical versioned
   * read on a bounded cadence; usePollSync decides whether to adopt it.
   */
  readonly refreshIntervalMs = 2_000;
  readonly apiBaseUrl: string;
  readonly shotComposition: ShotCompositionPort = {
    load: async (request) => this.loadRuntimeShotComposition(request.projectId, request.parentDocumentId),
    publish: async (request) => {
      try {
        assertGraphRequestIdentity(request.graph, request.projectId, request.parentDocumentId);
        const timeline = await this.client.getProjectTimeline(request.projectId, request.parentDocumentId);
        assertRuntimeIdentity(timeline, request.projectId, request.parentDocumentId, 'timeline');
        const currentHead = nullableString(timeline.head_revision_id, 'timeline.head_revision_id');
        assertExpectedHead(request.expectedHeadRevisionId, currentHead);
        const publication = await toRuntimePublication(request.graph, request.projectId, request.parentDocumentId, request.expectedHeadRevisionId);
        await this.client.publishParentComposition(request.projectId, request.parentDocumentId, publication);
        // The mutation receipt is not the canonical graph. Reload the committed
        // head and its immutable closure so callers only observe durable bytes.
        return await this.loadRuntimeShotComposition(request.projectId, request.parentDocumentId);
      } catch (error) {
        if (error instanceof ApiError && error.status === 409) {
          throw new StaleWriteError(`Workspace Runtime rejected a stale shot-composition write: ${error.message}`);
        }
        throw error;
      }
    },
  };

  private readonly projectId: string;
  private readonly client: ReighRuntimeClient;
  private readonly onRuntimeError?: (error: RuntimeConnectorError) => void;
  private activeRegistry: AssetRegistry | null = null;

  constructor(options: RuntimeDataProviderOptions) {
    this.projectId = options.projectId;
    this.client = new ReighRuntimeClient({ baseUrl: options.baseUrl, token: options.token, transport: options.transport });
    this.onRuntimeError = options.onRuntimeError;
    this.apiBaseUrl = this.client.baseUrl;
  }

  private async loadRuntimeShotComposition(projectId: string, timelineId: string): Promise<unknown> {
    const timeline = await this.client.getProjectTimeline(projectId, timelineId);
    assertRuntimeIdentity(timeline, projectId, timelineId, 'timeline');
    const headRevisionId = nullableString(timeline.head_revision_id, 'timeline.head_revision_id');
    if (headRevisionId === null) {
      throw new ShotCompositionUnavailableError(
        `Workspace Runtime timeline ${timelineId} has no published canonical shot-composition head`,
      );
    }
    const parent = await this.client.getProjectParentCompositionRevision(projectId, timelineId, headRevisionId);
    assertRuntimeIdentity(parent, projectId, timelineId, 'parent composition revision');
    assertRevisionIdentity(parent, headRevisionId, 'parent composition revision');
    const parentPayload = requiredRecord(parent.payload, 'parent composition revision.payload');
    const rawOccurrences = array(parentPayload.occurrences, 'parent composition.occurrences');
    const identities = uniqueOccurrences(rawOccurrences).map((occurrence) => ({
      shotId: requiredString(occurrence.shot_id, 'parent composition occurrence.shot_id'),
      revisionId: requiredString(occurrence.shot_revision_id ?? occurrence.revision_id, 'parent composition occurrence.shot_revision_id'),
    }));
    const resolved = await Promise.all(identities.map(async ({ shotId, revisionId }) => {
      const shot = await this.client.getProjectShotRevision(projectId, shotId, revisionId);
      assertRuntimeIdentity(shot, projectId, shotId, 'shot revision');
      assertRevisionIdentity(shot, revisionId, 'shot revision');
      if (shot.shot_id !== shotId) throw new Error(`Runtime shot revision identity mismatch: requested ${shotId}, got ${String(shot.shot_id)}`);
      const internalRevisionId = requiredString(shot.internal_timeline_revision_id, `shot revision ${revisionId}.internal_timeline_revision_id`);
      const candidateScopes = [
        typeof shot.timeline_id === 'string' && shot.timeline_id.length > 0 ? shot.timeline_id : undefined,
        timelineId,
        `shot:${shotId}`,
      ].filter((scope, index, scopes): scope is string => Boolean(scope) && scopes.indexOf(scope) === index);
      let internalTimelineScope: string | undefined;
      let internal: RuntimeRecord | undefined;
      let lastNotFound: ApiError | undefined;
      for (const candidateScope of candidateScopes) {
        try {
          internal = await this.client.getProjectTimelineRevision(projectId, candidateScope, internalRevisionId);
          internalTimelineScope = candidateScope;
          break;
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) throw error;
          lastNotFound = error;
        }
      }
      if (!internal || !internalTimelineScope) {
        throw lastNotFound ?? new Error(`Workspace Runtime internal timeline revision ${internalRevisionId} was not found`);
      }
      assertRuntimeIdentity(internal, projectId, internalTimelineScope, 'internal timeline revision');
      assertRevisionIdentity(internal, internalRevisionId, 'internal timeline revision');
      return { shot, internal };
    }));
    return runtimeGraphToContract(projectId, timelineId, timeline, parent, resolved);
  }

  /** Re-open the cached Runtime handshake before the next hosted read. */
  async reconnect(): Promise<void> {
    try {
      await this.client.reconnect();
    } catch (error) {
      this.reportRuntimeError(error);
      throw error;
    }
  }

  async loadTimeline(timelineId: string): Promise<LoadedTimeline> {
    const record = await this.readTimeline(timelineId);
    const configRecord = asRecord(record.config);
    if (!configRecord) {
      throw new TimelineSchemaIncompatibleError('Workspace Runtime timeline has no config object');
    }
    const bundle = configRecord.bundle;
    if (bundle !== undefined && bundle !== null) parseTimelineBundle(bundle);
    const { bundle: _storedBundle, ...configWithoutBundle } = configRecord;
    return {
      config: withDefaultTimelineOutput(configWithoutBundle as Partial<TimelineConfig>),
      configVersion: runtimeVersion(record),
      ...(bundle === null ? { bundle: null } : bundle === undefined ? {} : { bundle: bundle as TimelineBundleEnvelope }),
    };
  }

  async loadAssetRegistry(timelineId: string): Promise<AssetRegistry> {
    const registry = normalizeRegistry((await this.readTimeline(timelineId)).registry);
    this.activeRegistry = registry;
    return registry;
  }

  async loadReferencedTimeline(timelineId: string): Promise<LoadedReferencedTimeline> {
    const record = await this.readTimeline(timelineId);
    const configRecord = asRecord(record.config);
    if (!configRecord) {
      throw new TimelineSchemaIncompatibleError('Workspace Runtime timeline has no config object');
    }
    const bundle = configRecord.bundle;
    if (bundle !== undefined && bundle !== null) parseTimelineBundle(bundle);
    const { bundle: _storedBundle, ...configWithoutBundle } = configRecord;
    return {
      timeline: {
        config: withDefaultTimelineOutput(configWithoutBundle as Partial<TimelineConfig>),
        configVersion: runtimeVersion(record),
        ...(bundle === null ? { bundle: null } : bundle === undefined ? {} : { bundle: bundle as TimelineBundleEnvelope }),
      },
      registry: normalizeRegistry(record.registry),
      resolveAssetUrl: async (file: string) => this.resolveAssetUrlFromRegistry(file, normalizeRegistry(record.registry)),
    };
  }

  async setPrimaryTimeline(timelineId: string): Promise<void> {
    const project = await this.client.getProject(this.projectId);
    await this.client.updateProject(
      this.projectId,
      generateUUID(),
      project.version,
      undefined,
      { ...project.metadata, default_timeline_id: timelineId },
    );
  }

  async saveTimeline(
    timelineId: string,
    config: TimelineConfig,
    expectedVersion: number,
    registry?: AssetRegistry,
    bundle?: TimelineBundleEnvelope | null,
  ): Promise<number> {
    if (bundle !== undefined && bundle !== null) parseTimelineBundle(bundle);
    const current = await this.readTimeline(timelineId);
    const nextRegistry = registry ?? normalizeRegistry(current.registry);
    const { output: _derivedOutput, ...configWithoutOutput } = config;
    const configForWire: RuntimeRecord = {
      ...configWithoutOutput,
      tracks: config.tracks ?? [],
      ...(bundle !== undefined ? { bundle } : {}),
    };

    try {
      const saved = await this.client.updateTimelineDocument(
        this.projectId,
        timelineId,
        expectedVersion,
        configForWire,
        nextRegistry as unknown as RuntimeRecord,
      );
      const savedRegistry = normalizeRegistry(saved.registry);
      this.activeRegistry = savedRegistry;
      return runtimeVersion(saved);
    } catch (error) {
      throw this.toProviderError(error, timelineId, expectedVersion);
    }
  }

  async resolveAssetUrl(file: string): Promise<string> {
    return this.resolveAssetUrlFromRegistry(file, this.activeRegistry);
  }

  /** Resolve a Runtime generation into the editor's existing lightbox row shape. */
  async loadGenerationForLightbox(generationId: string): Promise<GenerationRow | null> {
    try {
      const generation = await this.client.getGeneration(generationId);
      const variants = await listAllRuntimeVariants(this.client, generationId, 200);
      const primary = selectRuntimePrimaryVariant(variants);
      if (!primary?.object_id) return null;
      const mediaType = typeof primary.metadata.media_type === 'string'
        ? primary.metadata.media_type
        : (typeof primary.metadata.content_type === 'string' ? primary.metadata.content_type : 'image/png');
      const url = this.client.objectContentUrl(primary.object_id);
      const thumbnailObjectId = runtimeThumbnailObjectId(generation, primary.object_id);
      const thumbnailUrl = thumbnailObjectId
        ? this.client.objectContentUrl(thumbnailObjectId)
        : null;
      return {
        id: generation.generation_id,
        generation_id: generation.generation_id,
        location: url,
        imageUrl: url,
        ...(thumbnailUrl ? { thumbUrl: thumbnailUrl } : {}),
        type: mediaType,
        contentType: mediaType,
        createdAt: generation.created_at,
        metadata: generation.metadata,
        name: typeof generation.metadata.name === 'string' ? generation.metadata.name : null,
        primary_variant_id: primary.variant_id,
        source_task_id: generation.source_task_id ?? null,
        media_id: primary.object_id,
      };
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  /** Read managed bytes through the generated Range/ETag Runtime contract. */
  async readAsset(file: string, byteRange?: [number, number?]): Promise<ByteResponse> {
    const asset = this.findManagedAsset(file, true);
    const response = await this.client.getObject(asset.objectId, byteRange);
    assertManagedObjectIdentity(asset.objectId, asset.expectedDigest, response.etag);
    return response;
  }

  /** Read managed media metadata through the generated Range/ETag contract. */
  async headAsset(file: string, byteRange?: [number, number?]): Promise<ByteResponse> {
    const asset = this.findManagedAsset(file, true);
    const response = await this.client.headObject(asset.objectId, byteRange);
    assertManagedObjectIdentity(asset.objectId, asset.expectedDigest, response.etag);
    return response;
  }

  async onResolve(request: AssetResolveRequest): Promise<string> {
    return this.resolveAssetUrl(request.assetId ?? request.file);
  }

  async registerAsset(timelineId: string, assetId: string, entry: AssetRegistryEntry): Promise<void> {
    const record = await this.readTimeline(timelineId);
    const configRecord = asRecord(record.config);
    if (!configRecord) throw new TimelineSchemaIncompatibleError('Workspace Runtime timeline has no config object');
    await this.saveTimeline(
      timelineId,
      withDefaultTimelineOutput(configRecord as Partial<TimelineConfig>),
      runtimeVersion(record),
      {
        assets: { ...normalizeRegistry(record.registry).assets, [assetId]: entry },
      },
    );
  }

  async prepareAsset(file: File, options: UploadAssetOptions): Promise<UploadedAssetResult> {
    const object = await this.client.ingestProjectObject(
      this.projectId,
      new Uint8Array(await file.arrayBuffer()),
      file.type || 'application/octet-stream',
      options.filename ?? file.name,
    );
    const entry: AssetRegistryEntry = {
      media_id: object.object_id,
      content_sha256: object.digest,
      type: object.media_type,
      file: options.filename ?? file.name,
      metadata: {
        provenance: {
          sourceProvider: 'workspace-runtime',
          importedBy: options.userId,
          originalFilename: options.filename ?? file.name,
        },
      },
    };
    return { assetId: object.object_id, entry };
  }

  async uploadAsset(file: File, options: UploadAssetOptions): Promise<UploadedAssetResult> {
    const result = await this.prepareAsset(file, options);
    await this.registerAsset(options.timelineId, result.assetId, result.entry);
    return result;
  }

  async onUpload(request: AssetUploadRequest): Promise<UploadedAssetResult> {
    return this.uploadAsset(request.file, request.options);
  }

  private async readTimeline(timelineId: string): Promise<RuntimeRecord> {
    try {
      const record = await this.client.getProjectTimeline(this.projectId, timelineId);
      if (record.project_id !== undefined && record.project_id !== this.projectId) {
        throw new Error(`Workspace Runtime timeline belongs to project ${String(record.project_id)}, not ${this.projectId}`);
      }
      if (record.timeline_id !== undefined && record.timeline_id !== timelineId) {
        throw new Error(`Workspace Runtime timeline identity mismatch: requested ${timelineId}, got ${String(record.timeline_id)}`);
      }
      return record;
    } catch (error) {
      throw this.toProviderError(error, timelineId);
    }
  }

  private findManagedAsset(
    candidate: string,
    requireDigest = false,
    registry: AssetRegistry | null = this.activeRegistry,
  ): { objectId: string; expectedDigest: string } {
    const entry = Object.entries(registry?.assets ?? {}).find(([assetId, value]) => (
      assetId === candidate || value.file === candidate || value.media_id === candidate
    ))?.[1];
    const objectId = entry?.media_id;
    if (!objectId) {
      throw new Error(`Workspace Runtime has no managed object for asset ${candidate}`);
    }
    const expectedDigest = normalizeDigest(entry.content_sha256 ?? entry.etag);
    if (requireDigest && !expectedDigest) {
      throw new Error(`Workspace Runtime registry has no digest identity for managed object ${objectId}`);
    }
    return { objectId, expectedDigest };
  }

  private async resolveAssetUrlFromRegistry(
    file: string,
    registry: AssetRegistry | null,
  ): Promise<string> {
    const candidate = file.trim();
    if (!candidate) throw new Error('Cannot resolve a Runtime asset URL for an empty file path');
    if (/^https?:\/\//i.test(candidate)) return candidate;
    return this.client.objectContentUrl(this.findManagedAsset(candidate, false, registry).objectId);
  }

  private toProviderError(error: unknown, timelineId: string, expectedVersion?: number): Error {
    let providerError: Error;
    if (error instanceof TimelineSchemaIncompatibleError || error instanceof TimelineVersionConflictError) {
      providerError = error;
    } else if (isRuntimeConflict(error)) {
      const actual = asRecord(error.details)?.actual;
      providerError = new TimelineVersionConflictError(
        'Workspace Runtime rejected a stale timeline version; reload to review the canonical head.',
        expectedVersion,
        typeof actual === 'number' ? actual : undefined,
      );
    } else if (error instanceof ApiError && error.status === 404) {
      providerError = new TimelineNotFoundError(timelineId);
    } else {
      providerError = error instanceof Error ? error : new Error(String(error));
    }
    this.reportRuntimeError(providerError);
    return providerError;
  }

  private reportRuntimeError(error: unknown): void {
    if (error instanceof RuntimeAuthenticationError || error instanceof RuntimeUnavailableError) {
      this.onRuntimeError?.(error);
    }
  }
}

function asRecord(value: unknown): RuntimeRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RuntimeRecord
    : null;
}

function normalizeRegistry(value: unknown): AssetRegistry {
  const record = asRecord(value);
  const assets = asRecord(record?.assets);
  if (!assets) return { assets: {} };
  return {
    assets: Object.fromEntries(Object.entries(assets).map(([assetKey, rawEntry]) => {
      const entry = asRecord(rawEntry) as AssetRegistryEntry | null;
      if (!entry || entry.media_id || typeof entry.content_sha256 !== 'string') {
        return [assetKey, rawEntry];
      }
      const digest = entry.content_sha256.replace(/^sha256:/, '').trim();
      return /^[0-9a-f]{64}$/.test(digest)
        ? [assetKey, { ...entry, media_id: `sha256:${digest}` }]
        : [assetKey, rawEntry];
    })) as Record<string, AssetRegistryEntry>,
  };
}

function runtimeVersion(record: RuntimeRecord): number {
  const value = record.config_version ?? record.version;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new TimelineSchemaIncompatibleError('Workspace Runtime timeline has no positive version');
  }
  return value;
}

function normalizeDigest(value: string | undefined): string {
  return value?.trim().replace(/^W\//, '').replace(/^"|"$/g, '') ?? '';
}

function assertManagedObjectIdentity(
  objectId: string,
  expectedDigest: string,
  etag: string | undefined,
): void {
  const actualDigest = normalizeDigest(etag);
  if (!actualDigest) {
    throw new Error(`Workspace Runtime object ${objectId} response omitted its strong ETag identity`);
  }
  if (actualDigest !== expectedDigest) {
    throw new Error(
      `Workspace Runtime object identity mismatch for ${objectId}: expected ${expectedDigest}, got ${actualDigest}`,
    );
  }
}

export type { RuntimeUnavailableError };

function requiredRecord(value: unknown, label: string): RuntimeRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Workspace Runtime ${label} must be an object`);
  }
  return value as RuntimeRecord;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Workspace Runtime ${label} is missing`);
  }
  return value;
}

function nullableString(value: unknown, label: string): string | null {
  if (value === null) return null;
  return requiredString(value, label);
}

function array(value: unknown, label: string): RuntimeRecord[] {
  if (!Array.isArray(value)) throw new Error(`Workspace Runtime ${label} must be an array`);
  return value.map((item, index) => requiredRecord(item, `${label}[${index}]`));
}

function assertRuntimeIdentity(value: RuntimeRecord, projectId: string, identity: string, label: string): void {
  if (value.project_id !== projectId) {
    throw new Error(`Workspace Runtime ${label} belongs to project ${String(value.project_id)}, not ${projectId}`);
  }
  const key = label.includes('shot') ? 'shot_id' : 'timeline_id';
  if (value[key] !== identity) {
    throw new Error(`Workspace Runtime ${label} belongs to ${key === 'shot_id' ? 'shot' : 'timeline'} ${String(value[key])}, not ${identity}`);
  }
}

function assertRevisionIdentity(value: RuntimeRecord, revisionId: string, label: string): void {
  if (value.revision_id !== revisionId) {
    throw new Error(`Workspace Runtime ${label} identity mismatch: requested ${revisionId}, got ${String(value.revision_id)}`);
  }
}

function assertGraphRequestIdentity(graph: unknown, projectId: string, timelineId: string): void {
  const graphRecord = requiredRecord(graph, 'publication graph');
  const project = requiredRecord(graphRecord.project, 'publication graph.project');
  const primary = requiredRecord(graphRecord.primary_timeline, 'publication graph.primary_timeline');
  const graphProjectId = requiredString(project.project_id, 'publication graph.project.project_id');
  const projectDocumentId = requiredString(project.document_id, 'publication graph.project.document_id');
  const primaryDocumentId = requiredString(primary.document_id, 'publication graph.primary_timeline.document_id');
  if (graphProjectId !== projectId) {
    throw new Error(`Workspace Runtime publication graph belongs to project ${graphProjectId}, not ${projectId}`);
  }
  if (projectDocumentId !== timelineId) {
    throw new Error(`Workspace Runtime publication graph project document is ${projectDocumentId}, not ${timelineId}`);
  }
  if (primaryDocumentId !== timelineId) {
    throw new Error(`Workspace Runtime publication graph primary timeline is ${primaryDocumentId}, not ${timelineId}`);
  }
}

function uniqueOccurrences(occurrences: RuntimeRecord[]): RuntimeRecord[] {
  const seen = new Set<string>();
  return occurrences.filter((occurrence) => {
    const key = `${String(occurrence.shot_id)}\u0000${String(occurrence.shot_revision_id ?? occurrence.revision_id)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalArray(value: unknown, fallback: unknown[] = []): unknown[] {
  return Array.isArray(value) ? value : fallback;
}

function canonicalAudio(payload: RuntimeRecord, projectId: string, shotId: string, revisionId: string): RuntimeRecord {
  const candidate = Array.isArray(payload.audio) ? payload.audio[0] : payload.audio;
  const audio = candidate && typeof candidate === 'object' && !Array.isArray(candidate)
    ? candidate as RuntimeRecord
    : undefined;
  if (!audio) {
    throw new Error(`Workspace Runtime shot revision ${shotId}/${revisionId} has no canonical audio record`);
  }
  const scope = audio.scope && typeof audio.scope === 'object' && !Array.isArray(audio.scope)
    ? audio.scope as RuntimeRecord
    : { project_id: projectId };
  return { ...audio, scope: { ...scope, project_id: projectId } };
}

const SHA256_DIGEST = /^sha256:[0-9a-f]{64}$/i;

function canonicalAssetDigest(rawAsset: RuntimeRecord, objectId: string, label: string): string {
  const candidate = [rawAsset.digest, rawAsset.content_sha256, rawAsset.sha256, objectId]
    .find((value): value is string => typeof value === 'string' && value.length > 0);
  if (!candidate) {
    throw new Error(`Workspace Runtime ${label} has no immutable asset digest`);
  }
  if (SHA256_DIGEST.test(candidate)) return candidate.toLowerCase();
  if (/^[0-9a-f]{64}$/i.test(candidate)) return `sha256:${candidate.toLowerCase()}`;
  throw new Error(`Workspace Runtime ${label} has an invalid immutable asset digest`);
}

function canonicalAssetRole(rawAsset: RuntimeRecord, fallback?: string): string {
  const source = asRecord(rawAsset.source);
  const role = [rawAsset.role, rawAsset.media_type, rawAsset.type, source?.media_type, source?.type]
    .find((value): value is string => typeof value === 'string' && value.length > 0);
  return role ?? fallback ?? 'source';
}

/**
 * Normalize all media declarations for one pinned shot revision at the
 * Runtime boundary. A child timeline can carry an immutable registry even when
 * the older shot manifest omitted the same declaration; after this boundary
 * the canonical contract has one revision-scoped asset list and projection
 * does not need to understand transport-specific fallbacks.
 */
function normalizeShotRevisionAssets(
  projectId: string,
  shotId: string,
  revisionId: string,
  shotPayload: RuntimeRecord,
  timelinePayload: RuntimeRecord,
): RuntimeRecord[] {
  const assets = new Map<string, RuntimeRecord>();
  const add = (assetId: string, rawAsset: RuntimeRecord, sourceLabel: string): void => {
    const objectId = typeof rawAsset.object_id === 'string' && rawAsset.object_id.length > 0
      ? rawAsset.object_id
      : typeof rawAsset.media_id === 'string' && rawAsset.media_id.length > 0
        ? rawAsset.media_id
        : undefined;
    if (!objectId) return;
    const label = `${sourceLabel} ${shotId}/${revisionId} asset ${assetId}`;
    const normalized: RuntimeRecord = {
      ...rawAsset,
      asset_id: assetId,
      object_id: objectId,
      digest: canonicalAssetDigest(rawAsset, objectId, label),
      role: canonicalAssetRole(rawAsset, typeof assets.get(assetId)?.role === 'string' ? String(assets.get(assetId)?.role) : undefined),
      scope: { ...(asRecord(rawAsset.scope) ?? {}), project_id: projectId },
    };
    const existing = assets.get(assetId);
    if (existing && existing.object_id !== objectId) {
      throw new Error(
        `Workspace Runtime ${label} conflicts with object ${String(existing.object_id)}`,
      );
    }
    assets.set(assetId, { ...existing, ...normalized });
  };

  for (const rawAsset of canonicalArray(shotPayload.assets)) {
    const asset = asRecord(rawAsset);
    const assetId = typeof asset?.asset_id === 'string' && asset.asset_id.length > 0 ? asset.asset_id : undefined;
    if (asset && assetId) add(assetId, asset, 'shot revision');
  }

  const childAssetMaps = [
    asRecord(timelinePayload.assets),
    asRecord(asRecord(timelinePayload.registry)?.assets),
  ];
  for (const assetMap of childAssetMaps) {
    if (!assetMap) continue;
    for (const [assetId, rawAsset] of Object.entries(assetMap)) {
      const asset = asRecord(rawAsset);
      if (asset) add(assetId, asset, 'internal timeline');
    }
  }

  return [...assets.values()];
}

function runtimeGraphToContract(
  projectId: string,
  timelineId: string,
  timeline: RuntimeRecord,
  parent: RuntimeRecord,
  resolved: Array<{ shot: RuntimeRecord; internal: RuntimeRecord }>,
): RuntimeRecord {
  const parentPayload = requiredRecord(parent.payload, 'parent composition revision.payload');
  const parentOccurrences = array(parentPayload.occurrences, 'parent composition.occurrences');
  const resolvedByKey = new Map(resolved.map(({ shot, internal }) => [
    `${String(shot.shot_id)}\u0000${String(shot.revision_id)}`,
    { shot, internal },
  ]));
  const durationByKey = new Map(parentOccurrences.map((occurrence) => [
    `${String(occurrence.shot_id)}\u0000${String(occurrence.shot_revision_id ?? occurrence.revision_id)}`,
    Number(occurrence.duration_ms ?? occurrence.duration ?? 0),
  ]));
  const shotRevisions = resolved.map(({ shot, internal }) => {
    const shotPayload = requiredRecord(shot.payload, `shot revision ${String(shot.revision_id)}.payload`);
    const internalPayload = requiredRecord(internal.payload, `internal timeline revision ${String(internal.revision_id)}.payload`);
    const timelinePayload = requiredRecord(internalPayload.timeline ?? internalPayload, `internal timeline revision ${String(internal.revision_id)}.timeline`);
    const timing = shotPayload.timing && typeof shotPayload.timing === 'object' && !Array.isArray(shotPayload.timing)
      ? shotPayload.timing as RuntimeRecord
      : { duration_ms: durationByKey.get(`${String(shot.shot_id)}\u0000${String(shot.revision_id)}`) ?? 0 };
    const provenance = shotPayload.provenance && typeof shotPayload.provenance === 'object' && !Array.isArray(shotPayload.provenance)
      ? shotPayload.provenance as RuntimeRecord
      : {};
    return {
      ...shotPayload,
      shot_id: requiredString(shot.shot_id, 'shot revision.shot_id'),
      revision_id: requiredString(shot.revision_id, 'shot revision.revision_id'),
      document_role: 'shot_revision',
      content_digest: requiredString(shot.content_digest, 'shot revision.content_digest'),
      internal_timeline_revision: {
        timeline_id: typeof internal.timeline_id === 'string' && internal.timeline_id.length > 0
          ? internal.timeline_id
          : timelineId,
        revision_id: requiredString(internal.revision_id, 'internal timeline revision.revision_id'),
        content_digest: requiredString(internal.content_digest, 'internal timeline revision.content_digest'),
        timeline: timelinePayload,
      },
      dependencies: canonicalArray(shotPayload.dependencies),
      assets: normalizeShotRevisionAssets(projectId, String(shot.shot_id), String(shot.revision_id), shotPayload, timelinePayload),
      generation_inputs: canonicalArray(shotPayload.generation_inputs),
      timing,
      audio: canonicalAudio(shotPayload, projectId, String(shot.shot_id), String(shot.revision_id)),
      provenance,
    };
  });
  const graphOccurrences = parentOccurrences.map((occurrence, ordinal) => {
    const shotId = requiredString(occurrence.shot_id, `parent composition occurrence[${ordinal}].shot_id`);
    const revisionId = requiredString(occurrence.shot_revision_id ?? occurrence.revision_id, `parent composition occurrence[${ordinal}].shot_revision_id`);
    const placement = occurrence.placement && typeof occurrence.placement === 'object' && !Array.isArray(occurrence.placement)
      ? occurrence.placement as RuntimeRecord
      : {};
    const atMs = Number(placement.start_ms ?? occurrence.at_ms ?? 0);
    const durationMs = Number(occurrence.duration_ms ?? occurrence.duration ?? 0);
    const occurrenceId = requiredString(occurrence.occurrence_id, `parent composition occurrence[${ordinal}].occurrence_id`);
    return {
      occurrence_id: occurrenceId,
      parent_document_id: timelineId,
      shot_id: shotId,
      revision_id: revisionId,
      ordinal,
      at_ms: atMs,
      duration_ms: durationMs,
      stable_deep_link: stableOccurrenceDeepLink(projectId, timelineId, shotId, revisionId, occurrenceId),
      output_identity: stableOutputIdentity(projectId, timelineId, occurrenceId),
      placement,
      source_offset: occurrence.source_offset ?? 0,
      speed: occurrence.speed ?? 1,
      track: occurrence.track ?? placement.track ?? 'video',
      transform: occurrence.transform ?? {},
      gain: occurrence.gain ?? 1,
      muted: occurrence.muted ?? occurrence.mute ?? false,
      provenance: occurrence.provenance ?? {},
    };
  });
  for (const occurrence of graphOccurrences) {
    if (!resolvedByKey.has(`${occurrence.shot_id}\u0000${occurrence.revision_id}`)) {
      throw new Error(`Workspace Runtime parent composition references an unresolved shot revision ${occurrence.shot_id}/${occurrence.revision_id}`);
    }
  }
  const headRevisionId = requiredString(parent.revision_id, 'parent composition revision.revision_id');
  const parentGraph = {
    config: parentPayload.config ?? {},
    registry: parentPayload.registry ?? {},
    clips: parentPayload.clips ?? [],
    occurrences: parentPayload.occurrences,
  };
  return {
    schema_version: 1,
    project: { project_id: projectId, document_id: timelineId, role: 'project' },
    primary_timeline: {
      document_id: timelineId,
      role: 'primary_timeline',
      head: { revision_id: headRevisionId, content_digest: requiredString(parent.content_digest, 'parent composition revision.content_digest') },
    },
    parent_composition: parentGraph,
    shot_revisions: shotRevisions,
    occurrences: graphOccurrences,
    cases: {
      missing_dependency: { shot_id: 'missing-dependency', revision_id: 'missing-revision', expected: 'missing_dependency' },
      stale_write_rejection: { expected_head_revision_id: headRevisionId, submitted_head_revision_id: headRevisionId, expected_status: 409 },
    },
    timeline: { timeline_id: timeline.timeline_id, project_id: timeline.project_id, version: timeline.version },
  };
}

function runtimePayloadWithoutCanonicalEnvelope(revision: RuntimeRecord): RuntimeRecord {
  const { shot_id: _shotId, revision_id: _revisionId, document_role: _role, content_digest: _digest, internal_timeline_revision: _internal, publish: _publish, ...payload } = revision;
  return payload;
}

async function toRuntimePublication(
  graph: RuntimeRecord,
  projectId: string,
  timelineId: string,
  expectedHead: string | null,
): Promise<RuntimeRecord> {
  const primary = requiredRecord(graph.primary_timeline, 'primary_timeline');
  const head = requiredRecord(primary.head, 'primary_timeline.head');
  const parentRevisionId = requiredString(head.revision_id, 'primary_timeline.head.revision_id');
  const revisions = array(graph.shot_revisions, 'shot_revisions');
  const occurrences = array(graph.occurrences, 'occurrences');
  const revisionByKey = new Map(revisions.map((revision) => [
    `${String(revision.shot_id)}\u0000${String(revision.revision_id)}`,
    revision,
  ]));
  const used = uniqueOccurrences(occurrences).map((occurrence) => {
    const key = `${String(occurrence.shot_id)}\u0000${String(occurrence.revision_id)}`;
    const revision = revisionByKey.get(key);
    if (!revision) throw new Error(`Canonical graph is missing shot revision ${key}`);
    return revision;
  }).filter((revision) => revision.publish === true);
  const internalByKey = new Map<string, RuntimeRecord>();
  const shotRevisions = used.map((revision) => {
    const internal = requiredRecord(revision.internal_timeline_revision, `shot revision ${String(revision.revision_id)}.internal_timeline_revision`);
    const internalRevisionId = requiredString(internal.revision_id, 'internal timeline revision.revision_id');
    const internalTimeline = requiredRecord(internal.timeline, `internal timeline revision ${internalRevisionId}.timeline`);
    const internalTimelineId = typeof internal.timeline_id === 'string' && internal.timeline_id.length > 0
      ? internal.timeline_id
      : timelineId;
    const timelineRevision = {
      timeline_id: internalTimelineId,
      revision_id: internalRevisionId,
      payload: internalTimeline,
    };
    if (internal.publish === true) {
      internalByKey.set(`${internalTimelineId}\u0000${internalRevisionId}`, timelineRevision);
    }
    return {
      shot_id: requiredString(revision.shot_id, 'shot revision.shot_id'),
      revision_id: requiredString(revision.revision_id, 'shot revision.revision_id'),
      internal_timeline_revision_id: internalRevisionId,
      payload: runtimePayloadWithoutCanonicalEnvelope(revision),
    };
  });
  const parentSource = requiredRecord(graph.parent_composition ?? {}, 'parent_composition');
  const parentComposition = {
    config: parentSource.config ?? {},
    registry: parentSource.registry ?? {},
    clips: parentSource.clips ?? [],
    occurrences: occurrences.map((occurrence, ordinal) => ({
      occurrence_id: requiredString(occurrence.occurrence_id, `occurrences[${ordinal}].occurrence_id`),
      shot_id: requiredString(occurrence.shot_id, `occurrences[${ordinal}].shot_id`),
      shot_revision_id: requiredString(occurrence.revision_id, `occurrences[${ordinal}].revision_id`),
      placement: { start_ms: Number(occurrence.at_ms ?? 0), ...(occurrence.placement as RuntimeRecord ?? {}) },
      source_offset: occurrence.source_offset ?? 0,
      duration_ms: Number(occurrence.duration_ms ?? 0),
      speed: occurrence.speed ?? 1,
      track: occurrence.track ?? 'video',
      transform: occurrence.transform ?? {},
      gain: occurrence.gain ?? 1,
      mute: occurrence.muted ?? occurrence.mute ?? false,
      provenance: occurrence.provenance ?? {},
    })),
  };
  const mediaDigests = new Set<string>();
  const collectMedia = (value: unknown): void => {
    if (Array.isArray(value)) return value.forEach(collectMedia);
    if (value === null || typeof value !== 'object') return;
    for (const [key, item] of Object.entries(value as RuntimeRecord)) {
      if (['digest', 'content_digest', 'content_sha256', 'sha256'].includes(key) && typeof item === 'string' && /^sha256:[0-9a-f]{64}$/.test(item)) mediaDigests.add(item);
      else collectMedia(item);
    }
  };
  collectMedia(shotRevisions.map((revision) => revision.payload));
  collectMedia([...internalByKey.values()].map((revision) => revision.payload));
  collectMedia(parentComposition);
  return {
    project_id: projectId,
    timeline_id: timelineId,
    expected_head: expectedHead,
    parent_revision_id: parentRevisionId,
    parent_composition: parentComposition,
    shot_revisions: shotRevisions,
    internal_timeline_revisions: [...internalByKey.values()],
  };
}
