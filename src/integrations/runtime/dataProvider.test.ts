import { describe, expect, it } from 'vitest';
import { ReighRuntimeClient } from './client.ts';
import { RuntimeDataProvider } from './dataProvider.ts';
import { createDefaultTimelineConfig } from '@/tools/video-editor/lib/defaults.ts';

const PROJECT_ID = 'project-r1';
const TIMELINE_ID = 'timeline-r1';
const MANAGED_OBJECT_ID = 'object-r3-managed';
const MANAGED_OBJECT_DIGEST = `sha256:${'a'.repeat(64)}`;

function json(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function runtimeFixture(options: { mediaEtag?: string } = {}) {
  let documentVersion = 1;
  let config = createDefaultTimelineConfig();
  let registry = { assets: {} };
  const mediaEtag = options.mediaEtag ?? `"${MANAGED_OBJECT_DIGEST}"`;
  const requests: Array<{ method: string; path: string; headers: Record<string, string>; body?: unknown }> = [];

  const transport = async (
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: Uint8Array,
  ) => {
    const parsedBody = body && !path.endsWith(`/projects/${PROJECT_ID}/objects`)
      ? JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>
      : undefined;
    requests.push({ method, path, headers, ...(parsedBody ? { body: parsedBody } : {}) });

    if (path === '/v1/health') {
      return { status: 200, headers: {}, body: json({ status: 'ok', protocol: 'workspace.v1', schema_digest: 'sha256:test', runtime_epoch: 1 }) };
    }
    if (path === '/v1/handshake') {
      return { status: 200, headers: {}, body: json({ protocol: 'workspace.v1', schema_digest: 'sha256:test', session_id: 'session-r1', actor_id: 'owner', realm_id: 'realm-r1', scopes: ['handshake', 'projects:read', 'projects:write'] }) };
    }
    if (path === '/v1/realm') {
      return { status: 200, headers: {}, body: json({ realm_id: 'realm-r1', display_name: 'R1 fixture', version: 1, created_at: '2026-09-11T00:00:00Z' }) };
    }
    if (path === `/v1/projects/${PROJECT_ID}/objects` && method === 'POST') {
      return {
        status: 201,
        headers: {},
        body: json({
          data: {
            object_id: MANAGED_OBJECT_ID,
            digest: MANAGED_OBJECT_DIGEST,
            media_type: 'video/mp4',
            size: 13,
            version: 1,
            created_at: '2026-09-11T00:00:00Z',
            filename: 'managed-creative.mp4',
            relation: 'asset-upload',
          },
          receipt: {
            receipt_id: 'receipt-object-r3',
            command_kind: 'object.ingest',
            idempotency_key: headers['Idempotency-Key'],
            request_hash: 'object-hash',
            project_id: PROJECT_ID,
            project_seq: [1, 1],
            event_ids: ['event-object-r3'],
            result: {},
            created_at: '2026-09-11T00:00:00Z',
          },
        }),
      };
    }
    if (path === `/v1/objects/${MANAGED_OBJECT_ID}` && (method === 'GET' || method === 'HEAD')) {
      const ranged = headers.Range !== undefined;
      return {
        status: ranged ? 206 : 200,
        headers: {
          ETag: mediaEtag,
          'Accept-Ranges': 'bytes',
          ...(ranged ? { 'Content-Range': 'bytes 0-3/13' } : {}),
        },
        body: method === 'HEAD' ? new Uint8Array() : new Uint8Array([1, 2, 3, 4]),
      };
    }
    if (path === `/v1/timelines/${TIMELINE_ID}`) {
      return { status: 200, headers: {}, body: json({ timeline_id: TIMELINE_ID, project_id: PROJECT_ID, version: documentVersion, config_version: documentVersion, config, registry }) };
    }
    if (path === `/v1/projects/${PROJECT_ID}/documents/timeline%3A${TIMELINE_ID}` && method === 'GET') {
      return { status: 200, headers: {}, body: json({ document_id: `timeline:${TIMELINE_ID}`, project_id: PROJECT_ID, kind: 'timeline', content: { config, registry }, version: documentVersion, created_at: '2026-09-11T00:00:00Z', updated_at: '2026-09-11T00:00:00Z' }) };
    }
    if (path === `/v1/projects/${PROJECT_ID}/documents/timeline%3A${TIMELINE_ID}` && method === 'PATCH') {
      const request = parsedBody as { expected_version: number; content: { config: typeof config; registry: typeof registry } };
      if (request.expected_version !== documentVersion) {
        return { status: 409, headers: {}, body: json({ code: 'conflict', message: 'version conflict', details: { expected: request.expected_version, actual: documentVersion } }) };
      }
      documentVersion += 1;
      config = request.content.config;
      registry = request.content.registry;
      return {
        status: 200,
        headers: {},
        body: json({
          data: {
            document_id: `timeline:${TIMELINE_ID}`,
            project_id: PROJECT_ID,
            kind: 'timeline',
            content: request.content,
            version: documentVersion,
            created_at: '2026-09-11T00:00:00Z',
            updated_at: '2026-09-11T00:00:00Z',
          },
          receipt: {
            receipt_id: `receipt-${documentVersion}`,
            command_kind: 'document.update',
            idempotency_key: headers['Idempotency-Key'],
            request_hash: 'hash',
            project_id: PROJECT_ID,
            project_seq: [documentVersion, documentVersion],
            event_ids: [`event-${documentVersion}`],
            result: {},
            created_at: '2026-09-11T00:00:00Z',
          },
        }),
      };
    }
    throw new Error(`unexpected ${method} ${path}`);
  };

  return { transport, requests, read: () => ({ config, registry, documentVersion }) };
}

describe('RuntimeDataProvider', () => {
  it('uses the authenticated generated client for canonical read/save/readback/reload', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    expect(provider.refreshIntervalMs).toBe(2_000);
    const initial = await provider.loadTimeline(TIMELINE_ID);
    expect(initial.configVersion).toBe(1);
    const edited = { ...initial.config, tracks: initial.config.tracks.map((track, index) => index === 0 ? { ...track, label: 'Edited V1' } : track) };
    const savedVersion = await provider.saveTimeline(TIMELINE_ID, edited, initial.configVersion, await provider.loadAssetRegistry(TIMELINE_ID));
    const readback = await provider.loadTimeline(TIMELINE_ID);
    const reloaded = await provider.loadTimeline(TIMELINE_ID);

    expect(savedVersion).toBe(2);
    expect(readback.config.tracks[0]?.label).toBe('Edited V1');
    expect(reloaded.config.tracks[0]?.label).toBe('Edited V1');
    expect(reloaded.configVersion).toBe(2);
    expect(fixture.read().documentVersion).toBe(2);
    expect(fixture.read().config.tracks[0]?.label).toBe('Edited V1');
    expect(fixture.requests.filter((request) => request.path !== '/v1/health').every((request) => request.headers.Authorization === 'Bearer fixture-token')).toBe(true);
  });

  it('retains a managed object identity/provenance through upload and explicit timeline placement', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    const uploaded = await provider.uploadAsset(
      new File(['managed creative'], 'managed-creative.mp4', { type: 'video/mp4' }),
      { timelineId: TIMELINE_ID, userId: 'owner-r3' },
    );
    expect(uploaded).toMatchObject({
      assetId: MANAGED_OBJECT_ID,
      entry: {
        file: 'managed-creative.mp4',
        type: 'video/mp4',
        media_id: MANAGED_OBJECT_ID,
        content_sha256: MANAGED_OBJECT_DIGEST,
        metadata: {
          provenance: {
            sourceProvider: 'workspace-runtime',
            importedBy: 'owner-r3',
            originalFilename: 'managed-creative.mp4',
          },
        },
      },
    });
    expect(await provider.resolveAssetUrl(uploaded.assetId))
      .toBe(`http://runtime.test/v1/objects/${MANAGED_OBJECT_ID}`);

    const afterUpload = await provider.loadTimeline(TIMELINE_ID);
    const registry = await provider.loadAssetRegistry(TIMELINE_ID);
    const placedConfig = {
      ...afterUpload.config,
      clips: [{
        id: 'clip-r3-managed',
        at: 4,
        track: 'V1',
        asset: uploaded.assetId,
        from: 0,
        to: 2,
      }],
    };
    const placedVersion = await provider.saveTimeline(
      TIMELINE_ID,
      placedConfig,
      afterUpload.configVersion,
      registry,
    );
    const persisted = await provider.loadTimeline(TIMELINE_ID);
    const persistedRegistry = await provider.loadAssetRegistry(TIMELINE_ID);

    expect(placedVersion).toBe(3);
    expect(persisted.config.clips[0]).toMatchObject({
      id: 'clip-r3-managed',
      asset: MANAGED_OBJECT_ID,
      at: 4,
    });
    expect(persistedRegistry.assets[MANAGED_OBJECT_ID]).toMatchObject({
      media_id: MANAGED_OBJECT_ID,
      content_sha256: MANAGED_OBJECT_DIGEST,
      file: 'managed-creative.mp4',
      metadata: {
        provenance: {
          sourceProvider: 'workspace-runtime',
          importedBy: 'owner-r3',
          originalFilename: 'managed-creative.mp4',
        },
      },
    });
    expect(fixture.requests.filter((request) => request.path.includes('/objects')).map((request) => request.method))
      .toEqual(['POST']);
  });

  it('reconnects and validates managed media Range/ETag against registry identity', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    await provider.uploadAsset(
      new File(['managed creative'], 'managed-creative.mp4', { type: 'video/mp4' }),
      { timelineId: TIMELINE_ID, userId: 'owner-r4' },
    );
    const ranged = await provider.readAsset(MANAGED_OBJECT_ID, [0, 3]);
    const metadata = await provider.headAsset(MANAGED_OBJECT_ID);
    await provider.reconnect();

    expect(ranged.status).toBe(206);
    expect(ranged.etag).toBe(`"${MANAGED_OBJECT_DIGEST}"`);
    expect(ranged.content_range).toBe('bytes 0-3/13');
    expect(metadata.status).toBe(200);
    expect(metadata.etag).toBe(`"${MANAGED_OBJECT_DIGEST}"`);
    expect(fixture.requests.filter((request) => request.path === '/v1/handshake')).toHaveLength(2);
    expect(fixture.requests.find((request) => request.method === 'GET' && request.path === `/v1/objects/${MANAGED_OBJECT_ID}`)?.headers.Range)
      .toBe('bytes=0-3');
  });

  it('fails closed when managed media identity disagrees with the registry', async () => {
    const fixture = runtimeFixture({ mediaEtag: `"sha256:${'b'.repeat(64)}"` });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    await provider.uploadAsset(
      new File(['managed creative'], 'managed-creative.mp4', { type: 'video/mp4' }),
      { timelineId: TIMELINE_ID, userId: 'owner-r4' },
    );

    await expect(provider.headAsset(MANAGED_OBJECT_ID)).rejects.toThrow(
      `Workspace Runtime object identity mismatch for ${MANAGED_OBJECT_ID}: expected ${MANAGED_OBJECT_DIGEST}, got sha256:${'b'.repeat(64)}`,
    );
  });

  it('refuses a stale save without clobbering the canonical Runtime head', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    const firstEdit = { ...initial.config, tracks: initial.config.tracks.map((track, index) => index === 0 ? { ...track, label: 'First V1' } : track) };
    await provider.saveTimeline(TIMELINE_ID, firstEdit, initial.configVersion);
    const staleEdit = { ...initial.config, tracks: initial.config.tracks.map((track, index) => index === 0 ? { ...track, label: 'Stale V1' } : track) };

    await expect(provider.saveTimeline(TIMELINE_ID, staleEdit, initial.configVersion)).rejects.toMatchObject({
      name: 'TimelineVersionConflictError',
      code: 'timeline_version_conflict',
      expectedVersion: 1,
      actualVersion: 2,
    });
    expect(fixture.read().documentVersion).toBe(2);
    expect(fixture.read().config.tracks[0]?.label).toBe('First V1');
  });

  it('returns an actionable error when the Runtime is down', async () => {
    const client = new ReighRuntimeClient({
      baseUrl: 'http://runtime.test',
      token: 'fixture-token',
      transport: async () => { throw new Error('connect ECONNREFUSED'); },
    });

    await expect(client.ensureSession()).rejects.toMatchObject({
      name: 'RuntimeUnavailableError',
      code: 'runtime_unavailable',
      recoveryAction: 'Start the supported Runtime and configure its authenticated connector, then retry.',
    });
  });
});
