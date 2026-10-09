import { describe, expect, it } from 'vitest';
import { ReighRuntimeClient, RuntimeAuthenticationError } from './client.ts';
import type { RequestBody, Transport } from './generated.ts';
import { RuntimeDataProvider, toRuntimePublication } from './dataProvider.ts';
import { TimelineSchemaIncompatibleError, TimelineVersionConflictError } from '@/tools/video-editor/data/DataProvider.ts';
import { createTimelineReader } from '@/tools/video-editor/lib/timeline-reader.ts';
import { buildTimelineData } from '@/tools/video-editor/lib/timeline-data.ts';
import {
  RUNTIME_SCHEMA_DIGEST,
  RUNTIME_TARGETED_EXECUTION_CAPABILITY,
} from './contract-metadata.ts';
import { createDefaultTimelineConfig } from '@/tools/video-editor/lib/defaults.ts';
import type { ProjectObjectMetadata } from '@reigh/editor-sdk';

const PROJECT_ID = 'project-r1';
const TIMELINE_ID = 'timeline-r1';
const MANAGED_OBJECT_DIGEST = 'sha256:837705df2d47b071382f374110cbb5ef50b037c431cac6974cdfba986d836be7';
const MANAGED_OBJECT_ID = MANAGED_OBJECT_DIGEST;

async function sha256Digest(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return `sha256:${Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

type FixtureObject = {
  projectId: string;
  bytes: Uint8Array;
  digest: string;
  mediaType: string;
  filename?: string;
};
function fixtureError(code: string, message: string): Uint8Array {
  return json({ code, message });
}

function objectRange(
  bytes: Uint8Array,
  range: string | undefined,
): { status: number; bytes: Uint8Array; contentRange?: string } {
  if (!range) return { status: 200, bytes };
  const match = /^bytes=(\d+)-(\d*)$/.exec(range);
  if (!match) throw new Error(`unsupported fixture range ${range}`);
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : bytes.length - 1;
  const end = Math.min(requestedEnd, bytes.length - 1);
  if (start < 0 || start > end || start >= bytes.length) {
    throw new Error(`invalid fixture range ${range}`);
  }
  return {
    status: 206,
    bytes: bytes.slice(start, end + 1),
    contentRange: `bytes ${start}-${end}/${bytes.length}`,
  };
}

function json(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function packageBodyBytes(
  manifest: Record<string, unknown>,
  entry: unknown,
  assets: readonly unknown[] = [],
): Uint8Array {
  return json({ manifest, entry, assets });
}

// Saved R5 compact composition: 320x180/30 fps, three ordinary parent clips,
// no child occurrences (L3-managed-reconcile-normal-retry-result.md).
function compactParentComposition() {
  const config = {
    ...createDefaultTimelineConfig(),
    output: { ...createDefaultTimelineConfig().output, resolution: '320x180', fps: 30 },
    tracks: [...createDefaultTimelineConfig().tracks!, { id: 'Overlay', kind: 'visual' as const, label: 'Overlay' }],
    app: { extensionSentinel: { enabled: true } },
    customConfig: { sentinel: 'keep-config' },
  };
  const clips = [
    {
      id: 'l3-scene', track: 'V1', at: 0, from: 63, to: 65, speed: 1,
      clipType: 'com.reigh.astrid.liveScene',
      app: { liveScene: { revision: 'sha256:7c036c46ba2c4fedbf911a72b694c8c6ab2f5dd3211d4023857809a4bbc7fe6b', html: '<html>scene fixture</html>' } },
    },
    { id: 'l3-label', track: 'Overlay', at: 0.5, hold: 1, text: 'Maple Hollow' },
    { id: 'l3-tone', track: 'A1', at: 0.4, from: 0, to: 0.6, volume: 0.8, asset: 'tone' },
  ];
  const registry = {
    assets: { tone: {
      file: 'tone.wav', type: 'audio' as const, duration: 0.6,
      media_id: 'sha256:fa17b6d0dc1e6ca7aed9833b0ceded944644f12b22964f081d7a982427f8ac29',
      content_sha256: 'sha256:fa17b6d0dc1e6ca7aed9833b0ceded944644f12b22964f081d7a982427f8ac29',
      metadata: { provenance: { sourceProvider: 'runtime-fixture' } },
    } },
    customRegistry: { sentinel: 'keep-registry' },
  };
  return { config, registry, clips, occurrences: [], tracks: config.tracks, provenance: { sentinel: 'keep-parent' } };
}

function runtimeFixture(options: {
  mediaEtag?: string;
  objectReadOverrides?: Map<string, Uint8Array>;
  parentComposition?: Record<string, unknown>;
} = {}) {
  let documentVersion = 1;
  let headRevisionId = 'parent-r1';
  let config = createDefaultTimelineConfig();
  let registry = { assets: {} };
  let parentComposition = { config, registry, clips: [], occurrences: [], ...options.parentComposition };
  config = parentComposition.config;
  registry = parentComposition.registry;
  let objectSequence = 0;
  const objects = new Map<string, FixtureObject>();
  const mediaEtag = options.mediaEtag;
  const requests: Array<{ method: string; path: string; headers: Record<string, string>; body?: unknown }> = [];

  const transport: Transport = async (
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: RequestBody,
  ): ReturnType<Transport> => {
    const projectObjectPath = /^\/v1\/projects\/([^/]+)\/objects$/.exec(path);
    const isMediaImport = path.endsWith('/media-imports');
    const parsedBody = body && !projectObjectPath && !isMediaImport
      ? JSON.parse(body instanceof Blob ? await body.text() : new TextDecoder().decode(body)) as Record<string, unknown>
      : undefined;
    requests.push({ method, path, headers, ...(parsedBody ? { body: parsedBody } : {}) });

    if (path === '/v1/health') {
      return { status: 200, headers: {}, body: json({ status: 'ok', protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, runtime_epoch: 1 }) };
    }
    if (path === '/v1/handshake') {
      return { status: 200, headers: {}, body: json({ protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, session_id: 'session-r1', actor_id: 'owner', realm_id: 'realm-r1', scopes: ['handshake', 'projects:read', 'projects:write'], capabilities: [RUNTIME_TARGETED_EXECUTION_CAPABILITY] }) };
    }
    if (path === '/v1/realm') {
      return { status: 200, headers: {}, body: json({ realm_id: 'realm-r1', display_name: 'R1 fixture', version: 1, created_at: '2026-09-11T00:00:00Z' }) };
    }
    if (method === 'POST' && path === `/v1/projects/${PROJECT_ID}/media-imports`) {
      const operationId = headers['Idempotency-Key'] ?? '';
      const bytes = body instanceof Blob
        ? new Uint8Array(await body.arrayBuffer())
        : body instanceof Uint8Array ? new Uint8Array(body) : new Uint8Array();
      objects.set(MANAGED_OBJECT_ID, {
        projectId: PROJECT_ID,
        bytes,
        digest: MANAGED_OBJECT_DIGEST,
        mediaType: headers['Content-Type'] ?? 'video/mp4',
        filename: headers['X-Original-Name'] ?? 'managed-creative.mp4',
      });
      return {
        status: 201,
        headers: {},
        body: json({
          data: {
            provider: 'runtime', project: PROJECT_ID, import_operation_id: operationId, status: 'completed',
            task_id: 'task-import-r3', generation_id: 'generation-import-r3', variant_id: 'variant-import-r3',
            asset_id: MANAGED_OBJECT_ID,
            entry: { object_id: MANAGED_OBJECT_ID, media_type: headers['Content-Type'] ?? 'video/mp4', size: bytes.byteLength, filename: headers['X-Original-Name'] ?? 'managed-creative.mp4' },
            provenance: { source: 'external_upload', origin: 'imported', actor_id: 'owner' },
            actor_id: 'owner',
          },
          receipt: {
            receipt_id: 'receipt-import-r3', command_kind: 'media.import', idempotency_key: operationId,
          },
        }),
      };
    }
    if (projectObjectPath && method === 'POST') {
      if (!body) {
        return { status: 400, headers: {}, body: fixtureError('empty_body', 'project object body is required') };
      }
      const bytes = body instanceof Uint8Array ? new Uint8Array(body) : new Uint8Array(await body.arrayBuffer());
      const digest = await sha256Digest(bytes);
      const filename = headers['X-Original-Name'];
      const projectId = projectObjectPath[1]!;
      const objectId = filename === 'managed-creative.mp4'
        ? MANAGED_OBJECT_ID
        : `project-object-${++objectSequence}`;
      const object: FixtureObject = {
        projectId,
        bytes,
        digest,
        mediaType: headers['Content-Type'] ?? 'application/octet-stream',
        ...(filename ? { filename } : {}),
      };
      objects.set(objectId, object);
      return {
        status: 201,
        headers: { ETag: `"${digest}"` },
        body: json({
          data: {
            object_id: objectId,
            digest,
            media_type: object.mediaType,
            size: bytes.byteLength,
            version: 1,
            created_at: '2026-09-11T00:00:00Z',
            ...(object.filename ? { filename: object.filename } : {}),
            relation: 'asset-upload',
          },
          receipt: {
            receipt_id: `receipt-object-${objectId}`,
            command_kind: 'object.ingest',
            idempotency_key: headers['Idempotency-Key'],
            project_id: object.projectId,
            project_seq: [1, 1],
            event_ids: [`event-object-${objectId}`],
            result: {},
            created_at: '2026-09-11T00:00:00Z',
          },
        }),
      };
    }
    const projectObjectLocationPath = /^\/v1\/projects\/([^/]+)\/objects\/([^/]+)\/location$/.exec(path);
    if (projectObjectLocationPath && method === 'GET') {
      const projectId = projectObjectLocationPath[1]!;
      const objectId = decodeURIComponent(projectObjectLocationPath[2]!);
      const object = objects.get(objectId);
      if (!object || object.projectId !== projectId) {
        return { status: 404, headers: {}, body: fixtureError('not_found', `object ${objectId} is not in project ${projectId}`) };
      }
      return {
        status: 200,
        headers: {},
        body: json({
          object_id: objectId,
          digest: object.digest,
          size: object.bytes.byteLength,
          media_type: object.mediaType,
          ...(object.filename ? { filename: object.filename } : {}),
          local_path: `/runtime/${projectId}/${objectId}`,
          storage: 'runtime_cas',
          verified: true,
        }),
      };
    }
    if (path.startsWith('/v1/objects/') && (method === 'GET' || method === 'HEAD')) {
      const objectId = decodeURIComponent(path.slice('/v1/objects/'.length));
      const object = objects.get(objectId);
      if (!object) {
        return { status: 404, headers: {}, body: fixtureError('not_found', `unknown object ${objectId}`) };
      }
      const servedBytes = options.objectReadOverrides?.get(objectId) ?? object.bytes;
      const ranged = objectRange(servedBytes, headers.Range);
      const etag = objectId === MANAGED_OBJECT_ID && mediaEtag
        ? mediaEtag
        : `"${await sha256Digest(servedBytes)}"`;
      return {
        status: ranged.status,
        headers: {
          ETag: etag,
          'Accept-Ranges': 'bytes',
          ...(ranged.contentRange ? { 'Content-Range': ranged.contentRange } : {}),
        },
        body: method === 'HEAD' ? new Uint8Array() : ranged.bytes,
      };
    }
    if (method === 'POST' && path === `/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/inspect`) {
      return {
        status: 200,
        headers: {},
        body: json({
          schema: 'runtime.timeline.declared_inputs/v1',
          evidence_kind: 'declared_inputs',
          render_requested: false,
          representation: 'canonical_head',
          authority: 'runtime_parent_composition',
          project_id: PROJECT_ID,
          timeline_id: TIMELINE_ID,
          revision_id: headRevisionId,
          head_revision_id: headRevisionId,
          is_current_head: true,
          parent_content_digest: `sha256:${'1'.repeat(64)}`,
          head_content_digest: `sha256:${'1'.repeat(64)}`,
          snapshot_digest: `sha256:${'2'.repeat(64)}`,
          selectors: {},
          selection_status: 'selected',
          target_count: 0,
          occurrence_count: 0,
          parent_clip_count: 0,
          parent_clip_target_count: 0,
          selected_clip_count: 0,
          selected: [],
          selected_parent_clips: [],
          next_cursor: null,
        }),
      };
    }
    if (method === 'GET' && path === `/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/composition-revisions/${headRevisionId}`) {
      return {
        status: 200,
        headers: {},
        body: json({
          revision_id: headRevisionId,
          project_id: PROJECT_ID,
          timeline_id: TIMELINE_ID,
          content_digest: `sha256:${'1'.repeat(64)}`,
          payload: parentComposition,
          created_at: '2026-09-11T00:00:00Z',
        }),
      };
    }
    if (method === 'POST' && path === `/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/composition-revisions`) {
      const request = parsedBody as {
        expected_head: string | null;
        parent_revision_id: string;
        parent_composition: typeof parentComposition;
      };
      if (request.expected_head !== headRevisionId) {
        return { status: 409, headers: {}, body: json({ code: 'conflict', message: 'head conflict', details: { actual_head: headRevisionId } }) };
      }
      documentVersion += 1;
      headRevisionId = request.parent_revision_id;
      config = request.parent_composition.config;
      registry = request.parent_composition.registry;
      parentComposition = request.parent_composition;
      return {
        status: 200,
        headers: {},
        body: json({
          data: {
            project_id: PROJECT_ID,
            timeline_id: TIMELINE_ID,
            revision_id: headRevisionId,
            parent_revision_id: headRevisionId,
            new_head: headRevisionId,
            content_digest: `sha256:${'1'.repeat(64)}`,
            payload: parentComposition,
          },
          receipt: {
            receipt_id: `receipt-${documentVersion}`,
            command_kind: 'parent_composition.publish',
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
    if (path === `/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}`) {
      throw new Error('retired mutable timeline GET must not be used');
    }
    if (path.includes('/documents/timeline%3A')) {
      throw new Error('retired mutable timeline document route must not be used');
    }
    throw new Error(`unexpected ${method} ${path}`);
  };

  return { transport, requests, read: () => ({ config, registry, documentVersion, parentComposition }) };
}

describe('RuntimeDataProvider', () => {
  it.each(['empty', 'absent'] as const)('projects top-level compact parent clips with %s config clips through direct and referenced reads', async (shape) => {
    const parent = compactParentComposition();
    const { clips: _clips, ...withoutClips } = parent.config;
    const fixture = runtimeFixture({ parentComposition: { ...parent, config: shape === 'absent' ? withoutClips : parent.config } });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    const loaded = await provider.loadTimeline(TIMELINE_ID);
    const referenced = await provider.loadReferencedTimeline(TIMELINE_ID);
    expect(loaded.config.clips).toEqual(parent.clips);
    expect(referenced.timeline.config).toEqual(loaded.config);
    expect(loaded.config).toMatchObject({ ...withoutClips, clips: parent.clips });
    expect(referenced.registry).toEqual(parent.registry);
    expect(await referenced.resolveAssetUrl('tone.wav')).toContain(encodeURIComponent(parent.registry.assets.tone.media_id));
    expect(fixture.read().parentComposition).toEqual({ ...parent, config: shape === 'absent' ? withoutClips : parent.config });
    expect(fixture.read().parentComposition.occurrences).toEqual([]);
  });

  it.each(['absent', 'empty', 'equal'] as const)('preserves legacy config clips with %s top-level clips', async (shape) => {
    const parent = compactParentComposition();
    const { clips: _clips, ...withoutClips } = parent;
    // Equal dicts remain equal when their JSON member insertion order differs.
    const reversedKeys = parent.clips.map((clip) => Object.fromEntries(Object.entries(clip).reverse()));
    const fixture = runtimeFixture({ parentComposition: {
      ...withoutClips,
      clips: shape === 'absent' ? undefined : shape === 'empty' ? [] : reversedKeys,
      config: { ...parent.config, clips: parent.clips },
    } });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });
    expect((await provider.loadTimeline(TIMELINE_ID)).config.clips).toEqual(parent.clips);
    expect((await provider.loadReferencedTimeline(TIMELINE_ID)).timeline.config.clips).toEqual(parent.clips);
  });

  it('preserves empty legacy timelines', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });
    expect((await provider.loadTimeline(TIMELINE_ID)).config).toEqual(createDefaultTimelineConfig());
  });

  it.each(['edit', 'reorder'] as const)('rejects conflicting non-empty clip lists on %s without publishing', async (conflict) => {
    const parent = compactParentComposition();
    const clips = conflict === 'edit'
      ? parent.clips.map((clip, index) => index === 0 ? { ...clip, at: 1 } : clip)
      : [...parent.clips].reverse();
    const fixture = runtimeFixture({ parentComposition: { ...parent, config: { ...parent.config, clips } } });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });
    await expect(provider.loadTimeline(TIMELINE_ID)).rejects.toThrow('clips disagree');
    await expect(provider.loadReferencedTimeline(TIMELINE_ID)).rejects.toBeInstanceOf(TimelineSchemaIncompatibleError);
    await expect(provider.saveTimeline(TIMELINE_ID, createDefaultTimelineConfig(), 1)).rejects.toBeInstanceOf(TimelineSchemaIncompatibleError);
    expect(fixture.requests.some((request) => request.path.endsWith('/composition-revisions'))).toBe(false);
  });

  it.each([
    { location: 'parent', value: null }, { location: 'parent', value: {} },
    { location: 'config', value: null }, { location: 'config', value: 'clips' },
  ])('rejects malformed $location clips ($value)', async ({ location, value }) => {
    const parent = compactParentComposition();
    const fixture = runtimeFixture({ parentComposition: location === 'parent'
      ? { ...parent, clips: value }
      : { ...parent, config: { ...parent.config, clips: value } } });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });
    await expect(provider.loadTimeline(TIMELINE_ID)).rejects.toBeInstanceOf(TimelineSchemaIncompatibleError);
    await expect(provider.loadReferencedTimeline(TIMELINE_ID)).rejects.toThrow('clips are invalid');
  });

  it.each(['canonical', 'legacy'] as const)('keeps %s parent clips coherent through edit, partial deletion, complete deletion, and reload', async (shape) => {
    const parent = compactParentComposition();
    const fixture = runtimeFixture({ parentComposition: shape === 'canonical'
      ? parent
      : { ...parent, clips: [], config: { ...parent.config, clips: parent.clips } } });
    const options = { projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport };
    let provider = new RuntimeDataProvider(options);
    const initial = await provider.loadTimeline(TIMELINE_ID);
    const clips = initial.config.clips.map((clip) => clip.id === 'l3-scene' ? { ...clip, at: 0.1, from: 63.1 } : clip);
    for (const nextClips of [clips, clips.filter((clip) => clip.id !== 'l3-label'), []]) {
      const before = await provider.loadTimeline(TIMELINE_ID);
      const savedVersion = await provider.saveTimeline(TIMELINE_ID, { ...before.config, clips: nextClips }, before.configVersion, await provider.loadAssetRegistry(TIMELINE_ID));
      const persisted = fixture.read().parentComposition;
      expect(persisted.clips).toEqual(nextClips);
      expect(persisted.config.clips).toEqual(nextClips);
      expect(persisted).toMatchObject({ tracks: parent.tracks, occurrences: [], provenance: parent.provenance, registry: parent.registry });
      const { output: _output, clips: _storedClips, ...otherConfig } = parent.config;
      expect(persisted.config).toMatchObject(otherConfig);
      expect((await provider.loadTimeline(TIMELINE_ID)).configVersion).toBe(savedVersion);
      provider = new RuntimeDataProvider(options);
      const reopened = await provider.loadTimeline(TIMELINE_ID);
      expect(reopened.config.clips).toEqual(nextClips);
      // saveTimeline deliberately excludes read-derived output from the wire.
      expect(persisted.config).not.toHaveProperty('output');
      expect((await provider.loadReferencedTimeline(TIMELINE_ID)).timeline.config.clips).toEqual(nextClips);
      expect(await provider.loadAssetRegistry(TIMELINE_ID)).toEqual(parent.registry);
    }
    expect(fixture.read().parentComposition.clips).toEqual([]);
    expect(fixture.read().config.clips).toEqual([]);
    expect(fixture.requests.filter((request) => request.path.endsWith('/composition-revisions'))).toHaveLength(3);
  });

  it('serializes canonical placement start after stale nested placement metadata', async () => {
    const publication = await toRuntimePublication({
      primary_timeline: { head: { revision_id: 'head-1' } },
      shot_revisions: [{
        shot_id: 'shot-placement',
        revision_id: 'revision-placement',
        publish: true,
        internal_timeline_revision: {
          timeline_id: TIMELINE_ID,
          revision_id: 'timeline-placement',
          publish: true,
          timeline: { tracks: [{ id: 'video', kind: 'visual' }], clips: [{ id: 'clip', at_ms: 0, duration_ms: 2000 }] },
        },
      }],
      occurrences: [{
        occurrence_id: 'occ-placement',
        shot_id: 'shot-placement',
        revision_id: 'revision-placement',
        at_ms: 1500,
        duration_ms: 2000,
        placement: { start_ms: 0, track: 'video' },
      }],
      parent_composition: { config: {}, registry: {}, clips: [] },
    }, PROJECT_ID, TIMELINE_ID, 'head-1');

    expect((publication.parent_composition as Record<string, unknown>).occurrences).toEqual([
      expect.objectContaining({
        occurrence_id: 'occ-placement',
        placement: { start_ms: 1500, track: 'video' },
      }),
    ]);
  });

  it('loads the lightbox primary from the complete paginated variant set', async () => {
    const requests: string[] = [];
    const transport = async (method: string, path: string) => {
      requests.push(`${method} ${path}`);
      if (path === '/v1/health') {
        return { status: 200, headers: {}, body: json({ status: 'ok', protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, runtime_epoch: 1 }) };
      }
      if (path === '/v1/handshake') {
        return { status: 200, headers: {}, body: json({ protocol: 'workspace.v1', schema_digest: RUNTIME_SCHEMA_DIGEST, session_id: 'session-lightbox', actor_id: 'owner', realm_id: 'realm-r1', scopes: ['handshake', 'generations:read'], capabilities: [RUNTIME_TARGETED_EXECUTION_CAPABILITY] }) };
      }
      if (path === '/v1/realm') {
        return { status: 200, headers: {}, body: json({ realm_id: 'realm-r1', display_name: 'R1 fixture', version: 1, created_at: '2026-09-11T00:00:00Z' }) };
      }
      if (path === '/v1/generations/generation-lightbox') {
        return {
          status: 200,
          headers: {},
          body: json({
            generation_id: 'generation-lightbox',
            project_id: PROJECT_ID,
            type: 'image',
            status: 'succeeded',
            metadata: {},
            version: 1,
            created_at: '2026-09-11T00:00:00Z',
            updated_at: '2026-09-11T00:00:00Z',
          }),
        };
      }
      if (path === '/v1/generations/generation-lightbox/variants?limit=200') {
        return {
          status: 200,
          headers: {},
          body: json({
            items: [{
              variant_id: 'variant-first',
              generation_id: 'generation-lightbox',
              object_id: `sha256:${'a'.repeat(64)}`,
              variant_type: 'original',
              metadata: {},
              created_at: '2026-09-11T00:00:00Z',
            }],
            next_cursor: 'variants-page-2',
          }),
        };
      }
      if (path === '/v1/generations/generation-lightbox/variants?limit=200&cursor=variants-page-2') {
        return {
          status: 200,
          headers: {},
          body: json({
            items: [{
              variant_id: 'variant-primary',
              generation_id: 'generation-lightbox',
              object_id: `sha256:${'b'.repeat(64)}`,
              variant_type: 'edit',
              metadata: { is_primary: true, media_type: 'image/jpeg' },
              created_at: '2026-09-11T00:00:00Z',
            }],
            next_cursor: null,
          }),
        };
      }
      throw new Error(`unexpected ${method} ${path}`);
    };

    const provider = new RuntimeDataProvider({
      projectId: PROJECT_ID,
      baseUrl: 'http://runtime.test',
      token: 'fixture-token',
      transport,
    });

    const loaded = await provider.loadGenerationForLightbox('generation-lightbox');
    expect(loaded).toMatchObject({
      primary_variant_id: 'variant-primary',
      media_id: `sha256:${'b'.repeat(64)}`,
      type: 'image/jpeg',
    });
    expect(loaded).not.toHaveProperty('thumbUrl');
    expect(requests).toContain('GET /v1/generations/generation-lightbox/variants?limit=200&cursor=variants-page-2');
  });

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
        file: `http://runtime.test/v1/objects/${MANAGED_OBJECT_ID}`,
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
      file: `http://runtime.test/v1/objects/${MANAGED_OBJECT_ID}`,
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

  it('round-trips package and entry identities through Runtime reload with stale-write rejection', async () => {
    const objectReadOverrides = new Map<string, Uint8Array>();
    const fixture = runtimeFixture({ objectReadOverrides });
    const staleProvider = new RuntimeDataProvider({
      projectId: PROJECT_ID,
      baseUrl: 'http://runtime.test',
      token: 'fixture-token',
      transport: fixture.transport,
    });
    const staleInitial = await staleProvider.loadTimeline(TIMELINE_ID);
    const staleRegistry = await staleProvider.loadAssetRegistry(TIMELINE_ID);

    const provider = new RuntimeDataProvider({
      projectId: PROJECT_ID,
      baseUrl: 'http://runtime.test',
      token: 'fixture-token',
      transport: fixture.transport,
    });
    const initialSourceBytes = new TextEncoder().encode(
      '<!doctype html><html><body><script>document.body.dataset.scene="initial";</script></body></html>',
    );
    const uploaded = await provider.projectObjects.ingest(initialSourceBytes, 'text/html', 'scene.html');
    const initialReadback = await provider.projectObjects.read(uploaded.object_id);
    expect(Array.from(initialReadback)).toEqual(Array.from(initialSourceBytes));
    expect(await sha256Digest(initialReadback)).toBe(uploaded.digest);
    const initialManifest = { formatVersion: 1, entry: 'scene.html', duration: 100, authoredFps: 30 };
    const initialPackagePayload = { manifest: initialManifest, entry: uploaded, assets: [] };
    const initialPackageBytes = packageBodyBytes(initialManifest, uploaded);
    const initialPackageObject = await provider.projectObjects.ingest(
      initialPackageBytes,
      'application/json',
      'scene.package.json',
    );
    const initialPackageReadback = await provider.projectObjects.read(initialPackageObject.object_id);
    expect(Array.from(initialPackageReadback)).toEqual(Array.from(initialPackageBytes));
    expect(await sha256Digest(initialPackageReadback)).toBe(initialPackageObject.digest);
    expect(initialPackageObject.object_id).not.toBe(uploaded.object_id);
    expect(initialPackageObject.digest).not.toBe(uploaded.digest);
    const initialPackageBody = new TextDecoder().decode(initialPackageReadback);
    expect(JSON.parse(initialPackageBody)).toEqual(initialPackagePayload);
    expect(fixture.requests.filter((request) => request.path.includes('/objects')).map((request) => request.method))
      .toEqual(['POST', 'GET', 'GET', 'POST', 'GET', 'GET']);

    const initialLiveScene = {
      revision: initialPackageObject.digest,
      source: { objectId: initialPackageObject.object_id, revision: initialPackageObject.digest },
      packageBody: initialPackageBody,
      html: new TextDecoder().decode(initialReadback),
    };
    const afterInitialIngest = await provider.loadTimeline(TIMELINE_ID);
    const initialRegistry = await provider.loadAssetRegistry(TIMELINE_ID);
    const initialConfig = {
      ...afterInitialIngest.config,
      clips: [
        {
          id: 'scene-a',
          at: 2,
          track: 'V1',
          clipType: 'com.reigh.astrid.liveScene',
          label: 'scene A sentinel',
          from: 55,
          to: 75,
          speed: 1,
          app: { liveScene: initialLiveScene, unrelated: { sentinel: 'keep-scene-a' } },
        },
        {
          id: 'scene-b',
          at: 22,
          track: 'V1',
          clipType: 'com.reigh.astrid.liveScene',
          label: 'scene B sentinel',
          from: 20,
          to: 30,
          speed: 2,
          app: { liveScene: initialLiveScene, unrelated: { sentinel: 'keep-scene-b' } },
        },
      ],
    };
    const initialSavedVersion = await provider.saveTimeline(
      TIMELINE_ID,
      initialConfig,
      afterInitialIngest.configVersion,
      initialRegistry,
    );

    const winningSourceBytes = new TextEncoder().encode(
      '<!doctype html><html><body><script>document.body.dataset.scene="winning";</script></body></html>',
    );
    const winningObject = await provider.projectObjects.ingest(winningSourceBytes, 'text/html', 'scene.html');
    const winningReadback = await provider.projectObjects.read(winningObject.object_id);
    expect(Array.from(winningReadback)).toEqual(Array.from(winningSourceBytes));
    expect(await sha256Digest(winningReadback)).toBe(winningObject.digest);
    const winningManifest = { ...initialManifest, duration: 120, title: 'winning manifest' };
    const winningPackagePayload = { manifest: winningManifest, entry: winningObject, assets: [] };
    const winningPackageBytes = packageBodyBytes(winningManifest, winningObject);
    const winningPackageObject = await provider.projectObjects.ingest(
      winningPackageBytes,
      'application/json',
      'scene.package.json',
    );
    const winningPackageReadback = await provider.projectObjects.read(winningPackageObject.object_id);
    expect(Array.from(winningPackageReadback)).toEqual(Array.from(winningPackageBytes));
    expect(await sha256Digest(winningPackageReadback)).toBe(winningPackageObject.digest);
    expect(winningPackageObject.object_id).not.toBe(winningObject.object_id);
    expect(winningPackageObject.digest).not.toBe(winningObject.digest);
    expect(winningPackageObject.digest).not.toBe(initialPackageObject.digest);
    const winningPackageBody = new TextDecoder().decode(winningPackageReadback);
    expect(JSON.parse(winningPackageBody)).toEqual(winningPackagePayload);

    const manifestOnlyPackageBody = {
      manifest: { ...winningManifest, title: 'manifest-only revision' },
      entry: winningObject,
      assets: [],
    };
    const manifestOnlyPackageBytes = packageBodyBytes(
      manifestOnlyPackageBody.manifest,
      manifestOnlyPackageBody.entry,
      manifestOnlyPackageBody.assets,
    );
    const manifestOnlyPackageObject = await provider.projectObjects.ingest(
      manifestOnlyPackageBytes,
      'application/json',
      'scene.package.json',
    );
    const manifestOnlyPackageReadback = await provider.projectObjects.read(manifestOnlyPackageObject.object_id);
    expect(Array.from(manifestOnlyPackageReadback)).toEqual(Array.from(manifestOnlyPackageBytes));
    expect(await sha256Digest(manifestOnlyPackageReadback)).toBe(manifestOnlyPackageObject.digest);
    expect(manifestOnlyPackageObject.digest).not.toBe(winningPackageObject.digest);
    expect(manifestOnlyPackageBody.entry).toEqual(winningPackagePayload.entry);
    expect(manifestOnlyPackageBody.assets).toEqual(winningPackagePayload.assets);

    const winningLiveScene = {
      revision: winningPackageObject.digest,
      source: { objectId: winningPackageObject.object_id, revision: winningPackageObject.digest },
      packageBody: winningPackageBody,
      html: new TextDecoder().decode(winningReadback),
    };
    expect(winningLiveScene.html).toBe(new TextDecoder().decode(winningSourceBytes));
    const winningConfig = {
      ...initialConfig,
      clips: initialConfig.clips.map((clip) => ({
        ...clip,
        app: { ...clip.app, liveScene: winningLiveScene },
      })),
    };
    const winningVersion = await provider.saveTimeline(
      TIMELINE_ID,
      winningConfig,
      initialSavedVersion,
      await provider.loadAssetRegistry(TIMELINE_ID),
    );

    await expect(staleProvider.saveTimeline(
      TIMELINE_ID,
      { ...staleInitial.config, clips: [] },
      staleInitial.configVersion,
      staleRegistry,
    )).rejects.toBeInstanceOf(TimelineVersionConflictError);

    const reloadedProvider = new RuntimeDataProvider({
      projectId: PROJECT_ID,
      baseUrl: 'http://runtime.test',
      token: 'fixture-token',
      transport: fixture.transport,
    });
    const reopened = await reloadedProvider.loadTimeline(TIMELINE_ID);
    const reopenedRegistry = await reloadedProvider.loadAssetRegistry(TIMELINE_ID);
    const reopenedData = await buildTimelineData(reopened.config, reopenedRegistry);
    const clips = createTimelineReader({ data: reopenedData }).snapshot().clips;
    expect(winningVersion).toBe(3);
    expect(reopened.config.clips[0]?.app?.liveScene).toEqual({
      revision: winningPackageObject.digest,
      html: new TextDecoder().decode(winningSourceBytes),
      source: { objectId: winningPackageObject.object_id, revision: winningPackageObject.digest },
      packageBody: winningPackageBody,
    });
    expect(reopened.config.clips.map((clip) => ({
      id: clip.id,
      at: clip.at,
      from: clip.from,
      to: clip.to,
      speed: clip.speed,
      label: clip.label,
      unrelated: clip.app?.unrelated,
    }))).toEqual([
      {
        id: 'scene-a',
        at: 2,
        from: 55,
        to: 75,
        speed: 1,
        label: 'scene A sentinel',
        unrelated: { sentinel: 'keep-scene-a' },
      },
      {
        id: 'scene-b',
        at: 22,
        from: 20,
        to: 30,
        speed: 2,
        label: 'scene B sentinel',
        unrelated: { sentinel: 'keep-scene-b' },
      },
    ]);
    expect(clips.map((clip) => ({
      id: clip.id,
      at: clip.at,
      sourceOffset: clip.sourceOffset,
      sourceEnd: clip.sourceEnd,
      rate: clip.rate,
      source: clip.sourceRefs?.find((ref) => ref.sourceObjectId),
    }))).toEqual([
      {
        id: 'scene-a',
        at: 2,
        sourceOffset: 55,
        sourceEnd: 75,
        rate: 1,
        source: expect.objectContaining({
          sourceObjectId: winningPackageObject.object_id,
          sourceRevision: winningPackageObject.digest,
          packageRevision: winningPackageObject.digest,
        }),
      },
      {
        id: 'scene-b',
        at: 22,
        sourceOffset: 20,
        sourceEnd: 30,
        rate: 2,
        source: expect.objectContaining({
          sourceObjectId: winningPackageObject.object_id,
          sourceRevision: winningPackageObject.digest,
          packageRevision: winningPackageObject.digest,
        }),
      },
    ]);
    const reopenedPackageBytes = await reloadedProvider.projectObjects.read(winningPackageObject.object_id);
    expect(Array.from(reopenedPackageBytes)).toEqual(Array.from(winningPackageBytes));
    expect(await sha256Digest(reopenedPackageBytes)).toBe(winningPackageObject.digest);
    const reopenedPackagePayload = JSON.parse(new TextDecoder().decode(reopenedPackageBytes)) as {
      manifest: Record<string, unknown>;
      entry: ProjectObjectMetadata;
      assets: ProjectObjectMetadata[];
    };
    expect(reopenedPackagePayload).toEqual(winningPackagePayload);
    const reopenedWinningBytes = await reloadedProvider.projectObjects.read(reopenedPackagePayload.entry.object_id);
    expect(Array.from(reopenedWinningBytes)).toEqual(Array.from(winningSourceBytes));
    expect(await sha256Digest(reopenedWinningBytes)).toBe(reopenedPackagePayload.entry.digest);
    const originalBytes = await reloadedProvider.projectObjects.read(uploaded.object_id);
    expect(Array.from(originalBytes)).toEqual(Array.from(initialSourceBytes));
    expect(await sha256Digest(originalBytes)).toBe(uploaded.digest);

    // The Runtime ETag/digest check must reject an equal-length wrong entry.
    const wrongEntryBytes = new TextEncoder().encode(
      '<!doctype html><html><body><script>document.body.dataset.scene="changed";</script></body></html>',
    );
    expect(wrongEntryBytes.byteLength).toBe(winningSourceBytes.byteLength);
    objectReadOverrides.set(winningObject.object_id, wrongEntryBytes);
    await expect(reloadedProvider.projectObjects.read(winningObject.object_id))
      .rejects.toThrow(`Workspace Runtime object identity mismatch for ${winningObject.object_id}`);
    objectReadOverrides.delete(winningObject.object_id);

    await expect(reloadedProvider.projectObjects.read('unknown-project-object'))
      .rejects.toMatchObject({ status: 404 });
    const otherProjectProvider = new RuntimeDataProvider({
      projectId: 'project-r2',
      baseUrl: 'http://runtime.test',
      token: 'fixture-token',
      transport: fixture.transport,
    });
    const otherProjectObject = await otherProjectProvider.projectObjects.ingest(
      new TextEncoder().encode('<html>other-project</html>'),
      'text/html',
      'other-scene.html',
    );
    await expect(reloadedProvider.projectObjects.read(otherProjectObject.object_id))
      .rejects.toMatchObject({ status: 404 });
    expect(fixture.read().config.clips).toHaveLength(2);
    expect(fixture.read().config.clips[0]?.app?.liveScene.source)
      .toEqual({ objectId: winningPackageObject.object_id, revision: winningPackageObject.digest });
  });

  it('returns the stable catalog identity for freshly prepared media before registry readback', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    const prepared = await provider.prepareAsset(
      new File(['managed creative'], 'managed-creative.mp4', { type: 'video/mp4' }),
      { timelineId: TIMELINE_ID, userId: 'owner-r3' },
    );

    expect(prepared.assetId).toBe(MANAGED_OBJECT_ID);
    expect(prepared.entry).toMatchObject({ media_id: MANAGED_OBJECT_ID, generationId: 'generation-import-r3', variantId: 'variant-import-r3' });
    expect(fixture.requests.some((request) => request.method === 'POST' && request.path.endsWith('/media-imports'))).toBe(true);
    expect(fixture.requests.some((request) => request.method === 'POST' && request.path.endsWith('/objects'))).toBe(false);
    expect(prepared.entry.file).toBe(`http://runtime.test/v1/objects/${MANAGED_OBJECT_ID}`);
    await expect(provider.resolveAssetUrl(prepared.entry.file!))
      .resolves.toBe(`http://runtime.test/v1/objects/${MANAGED_OBJECT_ID}`);
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
    expect(ranged.content_range).toBe('bytes 0-3/16');
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
      'Workspace Runtime object identity mismatch',
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

  it('reports rejected Runtime credentials to the page recovery seam', async () => {
    const onRuntimeError = vi.fn();
    const provider = new RuntimeDataProvider({
      projectId: PROJECT_ID,
      baseUrl: 'http://runtime.test',
      token: 'fixture-token',
      onRuntimeError,
      transport: async (method, path) => {
        if (path === '/v1/health') {
          return { status: 401, headers: {}, body: json({ code: 'unauthorized', message: 'credential rejected' }) };
        }
        throw new Error(`unexpected ${method} ${path}`);
      },
    });

    await expect(provider.loadTimeline(TIMELINE_ID)).rejects.toBeInstanceOf(RuntimeAuthenticationError);
    expect(onRuntimeError).toHaveBeenCalledTimes(1);
    expect(onRuntimeError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'runtime_authentication',
      status: 401,
    }));
  });
});
