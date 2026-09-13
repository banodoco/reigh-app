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
  type UploadedAssetResult,
  type UploadAssetOptions,
} from '@/tools/video-editor/data/DataProvider.ts';
import type {
  AssetRegistry,
  AssetRegistryEntry,
  TimelineConfig,
} from '@/tools/video-editor/types/index.ts';
import type { Transport } from './generated.ts';
import type {
  AssetResolveRequest,
  AssetUploadRequest,
} from '@/tools/video-editor/data/AssetResolver.ts';
import type { TimelineBundleEnvelope } from '@/tools/video-editor/data/typed/timelineBundle.ts';
import { parseTimelineBundle } from '@/tools/video-editor/data/typed/timelineBundle.ts';
import { withDefaultTimelineOutput } from '@/tools/video-editor/lib/defaults.ts';

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
    const candidate = file.trim();
    if (!candidate) throw new Error('Cannot resolve a Runtime asset URL for an empty file path');
    if (/^https?:\/\//i.test(candidate)) return candidate;
    return this.client.objectContentUrl(this.findManagedAsset(candidate).objectId);
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

  async uploadAsset(file: File, options: UploadAssetOptions): Promise<UploadedAssetResult> {
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
    await this.registerAsset(options.timelineId, object.object_id, entry);
    return { assetId: object.object_id, entry };
  }

  async onUpload(request: AssetUploadRequest): Promise<UploadedAssetResult> {
    return this.uploadAsset(request.file, request.options);
  }

  private async readTimeline(timelineId: string): Promise<RuntimeRecord> {
    try {
      const record = await this.client.getTimeline(timelineId);
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
  ): { objectId: string; expectedDigest: string } {
    const entry = Object.entries(this.activeRegistry?.assets ?? {}).find(([assetId, value]) => (
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
  return { assets: assets as Record<string, AssetRegistryEntry> };
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
