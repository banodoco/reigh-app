import { describe, expect, it, vi } from 'vitest';
import { ReighRuntimeClient, RuntimeAuthenticationError } from './client.ts';
import { RuntimeDataProvider, toRuntimePublication } from './dataProvider.ts';
import { TimelineVersionConflictError } from '@/tools/video-editor/data/DataProvider.ts';
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
const MANAGED_OBJECT_ID = 'object-r3-managed';
const MANAGED_OBJECT_DIGEST = 'sha256:837705df2d47b071382f374110cbb5ef50b037c431cac6974cdfba986d836be7';

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

function runtimeFixture(options: {
  mediaEtag?: string;
  objectReadOverrides?: Map<string, Uint8Array>;
} = {}) {
  let documentVersion = 1;
  const receipts = new Map<string, { request: string; body: Uint8Array }>();
  let headRevisionId = 'parent-r1';
  let config = createDefaultTimelineConfig();
  let registry = { assets: {} };
  const revisions = new Map<string, unknown>([['parent-r1', { config, registry, clips: [], occurrences: [] }]]);
  let objectSequence = 0;
  const objects = new Map<string, FixtureObject>();
  const mediaEtag = options.mediaEtag;
  const requests: Array<{ method: string; path: string; headers: Record<string, string>; body?: unknown }> = [];

  const transport = async (
    method: string,
    path: string,
    headers: Record<string, string>,
    body?: Uint8Array,
  ) => {
    const projectObjectPath = /^\/v1\/projects\/([^/]+)\/objects$/.exec(path);
    const parsedBody = body && !projectObjectPath
      ? JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown>
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
    if (projectObjectPath && method === 'POST') {
      if (!body) {
        return { status: 400, headers: {}, body: fixtureError('empty_body', 'project object body is required') };
      }
      const bytes = new Uint8Array(body);
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
    const revisionPath = `/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/composition-revisions/`;
    const requestedRevision = path.startsWith(revisionPath) ? decodeURIComponent(path.slice(revisionPath.length)) : '';
    if (method === 'GET' && (revisions.has(requestedRevision) || requestedRevision === headRevisionId)) {
      return {
        status: 200,
        headers: {},
        body: json({
          revision_id: requestedRevision,
          project_id: PROJECT_ID,
          timeline_id: TIMELINE_ID,
          content_digest: `sha256:${'1'.repeat(64)}`,
          payload: revisions.get(requestedRevision) ?? { config, registry, clips: [], occurrences: [] },
          created_at: '2026-09-11T00:00:00Z',
        }),
      };
    }
    if (method === 'GET' && path.startsWith(`/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/composition-revisions?`)) {
      return {
        status: 200,
        headers: {},
        body: json({
          items: [{
            revision_id: 'parent-r1',
            project_id: PROJECT_ID,
            timeline_id: TIMELINE_ID,
            content_digest: `sha256:${'1'.repeat(64)}`,
            created_at: '2026-09-11T00:00:00Z',
            is_current_head: true,
          }, {
            revision_id: 'parent-old',
            project_id: PROJECT_ID,
            timeline_id: TIMELINE_ID,
            content_digest: `sha256:${'2'.repeat(64)}`,
            created_at: '2026-09-10T00:00:00Z',
            is_current_head: false,
          }],
          next_cursor: null,
        }),
      };
    }
    if (method === 'POST' && path === `/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/composition-revisions/parent-old/restore`) {
      const request = parsedBody as { expected_head: string | null };
      if (request.expected_head !== headRevisionId) {
        return { status: 409, headers: {}, body: json({ code: 'conflict', message: 'head conflict' }) };
      }
      headRevisionId = 'restore-parent-old';
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
            content_digest: `sha256:${'3'.repeat(64)}`,
          },
          receipt: {
            receipt_id: 'receipt-history-restore',
            command_kind: 'parent_composition.restore',
            idempotency_key: headers['Idempotency-Key'],
            request_hash: 'history-restore-hash',
            project_id: PROJECT_ID,
            project_seq: [2, 2],
            event_ids: [],
            result: {},
            created_at: '2026-09-11T00:00:00Z',
          },
        }),
      };
    }
    if (method === 'POST' && path === `/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/composition-revisions`) {
      const request = parsedBody as {
        expected_head: string | null;
        parent_revision_id: string;
        parent_composition: { config: typeof config; registry: typeof registry };
      };
      const requestJson = JSON.stringify(parsedBody);
      const receipt = receipts.get(headers['Idempotency-Key']);
      if (receipt) {
        if (receipt.request !== requestJson) throw new Error('idempotency payload mismatch');
        return { status: 200, headers: {}, body: receipt.body };
      }
      if (request.expected_head !== headRevisionId) {
        return { status: 409, headers: {}, body: json({ code: 'conflict', message: 'head conflict', details: { actual_head: headRevisionId } }) };
      }
      documentVersion += 1;
      headRevisionId = request.parent_revision_id;
      config = request.parent_composition.config;
      registry = request.parent_composition.registry;
      revisions.set(headRevisionId, structuredClone({ ...request.parent_composition, clips: [], occurrences: [] }));
      const response = {
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
            payload: { config, registry, clips: [], occurrences: [] },
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
      receipts.set(headers['Idempotency-Key'], { request: requestJson, body: response.body });
      return response;
    }
    if (path === `/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}`) {
      throw new Error('retired mutable timeline GET must not be used');
    }
    if (path.includes('/documents/timeline%3A')) {
      throw new Error('retired mutable timeline document route must not be used');
    }
    throw new Error(`unexpected ${method} ${path}`);
  };

  return { transport, requests, read: () => ({ config, registry, documentVersion }) };
}

describe('RuntimeDataProvider', () => {
  it('saves the same immutable head after provider recreation with a different numeric counter', async () => {
    const fixture = runtimeFixture();
    const original = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const first = await original.loadTimeline(TIMELINE_ID);
    await original.saveTimelineAtHead(TIMELINE_ID, first.config, first.head!);
    const base = await original.loadTimeline(TIMELINE_ID);
    const restarted = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const fresh = await restarted.loadTimeline(TIMELINE_ID);
    expect(base.configVersion).toBe(2);
    expect(fresh.configVersion).toBe(1);
    expect(fresh.head).toEqual(base.head);
    const edited = { ...base.config, clips: [{ id: 'ordinary-drag', track: 'track-frame', clipType: 'hold', at: 0, hold: 2 }] };
    await expect(restarted.saveTimelineAtHead(TIMELINE_ID, edited, base.head!)).resolves.toMatchObject({ configVersion: 2 });
    expect(fixture.read().config.clips[0]?.track).toBe('track-frame');
  });

  it('preserves the stored bundle when an editor save omits bundle updates', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    const bundle = { schema_version: 1 as const, itemsBySchemaRef: {} };
    const first = await provider.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!, undefined, bundle);
    const next = { ...initial.config, tracks: initial.config.tracks.map((track, index) => index === 0 ? { ...track, label: 'Preserve bundle' } : track) };
    await provider.saveTimelineAtHead(TIMELINE_ID, next, first.head);
    const publications = fixture.requests.filter((request) => request.method === 'POST' && request.path.endsWith('/composition-revisions'));
    const lastPublication = publications[publications.length - 1]?.body as { parent_composition?: { config?: { bundle?: unknown } } } | undefined;
    expect(lastPublication?.parent_composition?.config?.bundle).toEqual(bundle);
  });

  it('rejects different heads with equal numeric counters even after polling a newer head', async () => {
    const fixture = runtimeFixture();
    const stale = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const base = await stale.loadTimeline(TIMELINE_ID);
    await stale.saveTimelineAtHead(TIMELINE_ID, base.config, base.head!);
    const restarted = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const fresh = await restarted.loadTimeline(TIMELINE_ID);
    expect(fresh.configVersion).toBe(base.configVersion);
    expect(fresh.head).not.toEqual(base.head);
    const edited = { ...base.config, clips: [{ id: 'stale', track: 'V1', clipType: 'hold', at: 0, hold: 2 }] };
    await expect(restarted.saveTimelineAtHead(TIMELINE_ID, edited, base.head!)).rejects.toMatchObject({ code: 'timeline_version_conflict' });
    expect(fixture.read().config.clips).toEqual([]);
    expect(fixture.read().documentVersion).toBe(2);
  });

  it('protects a concurrent publication between the editor read and Runtime CAS', async () => {
    const fixture = runtimeFixture();
    const remote = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    let intervene = true;
    const transport: typeof fixture.transport = async (...args) => {
      if (intervene && args[0] === 'POST' && args[1].endsWith('/composition-revisions')) {
        intervene = false;
        const base = await remote.loadTimeline(TIMELINE_ID);
        await remote.saveTimelineAtHead(TIMELINE_ID, { ...base.config, clips: [{ id: 'remote', track: 'V1', clipType: 'hold', at: 0, hold: 1 }] }, base.head!);
      }
      return fixture.transport(...args);
    };
    const local = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const base = await local.loadTimeline(TIMELINE_ID);
    await expect(local.saveTimelineAtHead(TIMELINE_ID, base.config, base.head!)).rejects.toMatchObject({ code: 'timeline_version_conflict' });
    expect(fixture.read().config.clips[0]?.id).toBe('remote');
    expect(fixture.read().documentVersion).toBe(2);
  });

  it('fails closed for numeric-only saves and heads from another project or timeline', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const base = await provider.loadTimeline(TIMELINE_ID);
    await expect(provider.saveTimeline(TIMELINE_ID, base.config, base.configVersion)).rejects.toMatchObject({ code: 'timeline_version_conflict' });
    for (const head of [{ ...base.head!, projectId: 'another' }, { ...base.head!, timelineId: 'another' }]) {
      await expect(provider.saveTimelineAtHead(TIMELINE_ID, base.config, head)).rejects.toMatchObject({ code: 'timeline_version_conflict' });
    }
    expect(fixture.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/composition-revisions'))).toHaveLength(0);
  });

  it('replays a lost acknowledgement after provider restart with the original head, payload and key', async () => {
    const fixture = runtimeFixture();
    let loseAck = true;
    const transport: typeof fixture.transport = async (...args) => {
      const response = await fixture.transport(...args);
      if (loseAck && args[0] === 'POST' && args[1].endsWith('/composition-revisions')) {
        loseAck = false;
        throw new Error('lost acknowledgement');
      }
      return response;
    };
    const original = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const base = await original.loadTimeline(TIMELINE_ID);
    await expect(original.saveTimelineAtHead(TIMELINE_ID, base.config, base.head!)).rejects.toThrow('lost acknowledgement');
    const restarted = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    await expect(restarted.saveTimelineAtHead(TIMELINE_ID, base.config, base.head!)).resolves.toHaveProperty('head');
    const publications = fixture.requests.filter((r) => r.method === 'POST' && r.path.endsWith('/composition-revisions'));
    expect(publications).toHaveLength(2);
    expect(publications[1].body).toEqual(publications[0].body);
    expect(publications[1].headers['Idempotency-Key']).toBe(publications[0].headers['Idempotency-Key']);
    expect(fixture.read().documentVersion).toBe(2);
  });

  it('loads project-scoped canonical revisions and restores through a current-head CAS', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });

    const history = await provider.shotComposition.listHistory!({
      projectId: PROJECT_ID,
      parentDocumentId: TIMELINE_ID,
    });
    expect(history.map((entry) => entry.revisionId)).toEqual(['parent-r1', 'parent-old']);

    const restored = await provider.shotComposition.restoreHistory!({
      projectId: PROJECT_ID,
      parentDocumentId: TIMELINE_ID,
      revisionId: 'parent-old',
    });
    expect(restored.newHead).toBe('restore-parent-old');
    expect(fixture.requests.some((request) => request.method === 'POST'
      && request.path.endsWith('/composition-revisions/parent-old/restore')
      && request.body?.expected_head === 'parent-r1')).toBe(true);
    expect(fixture.requests.some((request) => request.method === 'GET'
      && request.path.endsWith('/composition-revisions/restore-parent-old'))).toBe(true);
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
    const savedVersion = await provider.saveTimelineAtHead(TIMELINE_ID, edited, initial.head!, await provider.loadAssetRegistry(TIMELINE_ID));
    const readback = await provider.loadTimeline(TIMELINE_ID);
    const reloaded = await provider.loadTimeline(TIMELINE_ID);

    expect(savedVersion.configVersion).toBe(2);
    expect(readback.config.tracks[0]?.label).toBe('Edited V1');
    expect(reloaded.config.tracks[0]?.label).toBe('Edited V1');
    expect(reloaded.configVersion).toBe(2);
    expect(fixture.read().documentVersion).toBe(2);
    expect(fixture.read().config.tracks[0]?.label).toBe('Edited V1');
    expect(fixture.requests.filter((request) => request.path !== '/v1/health').every((request) => request.headers.Authorization === 'Bearer fixture-token')).toBe(true);
  });

  it('does not let a delayed registry read overwrite a later save receipt', async () => {
    const fixture = runtimeFixture();
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    let delayRead = false;
    const transport: typeof fixture.transport = async (...args) => {
      const response = await fixture.transport(...args);
      if (delayRead && args[0] === 'GET' && args[1].includes('/composition-revisions/')) {
        delayRead = false;
        entered();
        await held;
      }
      return response;
    };
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    delayRead = true;
    const registryRead = provider.loadAssetRegistry(TIMELINE_ID);
    await started;
    const save = provider.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!);
    // Give an unguarded save time to commit while the old read is suspended.
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The old immutable response must finish before publication can advance state.
    release();
    await registryRead;
    const version = await save;
    expect(version.configVersion).toBe(2);
    expect((await provider.saveTimelineAtHead(TIMELINE_ID, initial.config, version.head)).configVersion).toBe(3);
    expect((await provider.loadTimeline(TIMELINE_ID)).configVersion).toBe(3);
  });

  it('keeps polling own publications behind their acknowledgement without inventing a version', async () => {
    const fixture = runtimeFixture();
    let release!: () => void;
    let entered!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const started = new Promise<void>((resolve) => { entered = resolve; });
    const transport: typeof fixture.transport = async (...args) => {
      const response = await fixture.transport(...args);
      if (args[0] === 'POST' && args[1].endsWith('/composition-revisions')) {
        entered();
        await held;
      }
      return response;
    };
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    const save = provider.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!);
    await started;
    const readsBefore = fixture.requests.filter((r) => r.path.endsWith('/inspect')).length;
    const poll = provider.loadTimeline(TIMELINE_ID);
    const registryPoll = provider.loadAssetRegistry(TIMELINE_ID);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fixture.requests.filter((r) => r.path.endsWith('/inspect'))).toHaveLength(readsBefore);
    release();
    expect((await save).configVersion).toBe(2);
    expect((await poll).configVersion).toBe(2);
    await registryPoll;
    expect((await provider.loadTimeline(TIMELINE_ID)).configVersion).toBe(2);
  });

  it('rejects overlapping stale saves and releases the queue after a rejection', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    const first = provider.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!);
    const second = provider.saveTimelineAtHead(TIMELINE_ID, { ...initial.config, clips: [{ id: 'stale', track: 'V1', clipType: 'hold', at: 0, hold: 1 }] }, initial.head!);
    const rejected = expect(second).rejects.toMatchObject({ code: 'timeline_version_conflict' });
    expect((await first).configVersion).toBe(2);
    await rejected;
    expect(fixture.requests.filter((r) => r.path.endsWith('/composition-revisions'))).toHaveLength(2);
    const reloaded = await provider.loadTimeline(TIMELINE_ID);
    expect(reloaded.configVersion).toBe(2);
    expect((await provider.saveTimelineAtHead(TIMELINE_ID, initial.config, reloaded.head!)).configVersion).toBe(3);
  });

  it('still rejects a genuine external publication without overwriting it', async () => {
    const fixture = runtimeFixture();
    const local = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const remote = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const initial = await local.loadTimeline(TIMELINE_ID);
    const other = await remote.loadTimeline(TIMELINE_ID);
    const remoteConfig = { ...other.config, tracks: other.config.tracks.map((t) => ({ ...t, label: 'Remote edit' })) };
    await remote.saveTimelineAtHead(TIMELINE_ID, remoteConfig, other.head!);
    await expect(local.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!))
      .rejects.toMatchObject({ code: 'timeline_version_conflict' });
    expect(fixture.read().config.tracks[0]?.label).toBe('Remote edit');
    expect((await local.loadTimeline(TIMELINE_ID)).configVersion).toBe(2);
  });

  it('recovers a lost save acknowledgement after polling through the original idempotency receipt', async () => {
    const fixture = runtimeFixture();
    let loseAck = true;
    const transport: typeof fixture.transport = async (...args) => {
      const response = await fixture.transport(...args);
      if (loseAck && args[0] === 'POST' && args[1].endsWith('/composition-revisions')) {
        loseAck = false;
        throw new Error('response lost after commit');
      }
      return response;
    };
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    await expect(provider.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!)).rejects.toThrow('response lost');
    expect((await provider.loadTimeline(TIMELINE_ID)).configVersion).toBe(2);
    const changed = { ...initial.config, tracks: initial.config.tracks.map((t) => ({ ...t, label: 'Unsent edit' })) };
    await expect(provider.saveTimelineAtHead(TIMELINE_ID, changed, initial.head!)).rejects.toMatchObject({ code: 'timeline_version_conflict' });
    const replay = await provider.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!);
    expect(replay.configVersion).toBe(2);
    const requests = fixture.requests.filter((r) => r.path.endsWith('/composition-revisions'));
    expect(requests).toHaveLength(2);
    expect(requests[1].body).toEqual(requests[0].body);
    expect(requests[1].headers['Idempotency-Key']).toBe(requests[0].headers['Idempotency-Key']);
    expect(fixture.read().documentVersion).toBe(2);
    expect((await provider.saveTimelineAtHead(TIMELINE_ID, changed, replay.head)).configVersion).toBe(3);
  });

  it('allows a fresh edit based on an explicitly reloaded head after an ambiguous save', async () => {
    const fixture = runtimeFixture();
    let loseAck = true;
    const transport: typeof fixture.transport = async (...args) => {
      const response = await fixture.transport(...args);
      if (loseAck && args[0] === 'POST' && args[1].endsWith('/composition-revisions')) {
        loseAck = false;
        throw new Error('response lost after commit');
      }
      return response;
    };
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    await expect(provider.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!)).rejects.toThrow('response lost');
    const reloaded = await provider.loadTimeline(TIMELINE_ID);
    const changed = { ...reloaded.config, tracks: reloaded.config.tracks.map((t) => ({ ...t, label: 'After reload' })) };
    expect((await provider.saveTimelineAtHead(TIMELINE_ID, changed, reloaded.head!)).configVersion).toBe(3);
    expect(fixture.read().config.tracks[0]?.label).toBe('After reload');
  });

  it('does not use an old receipt to overwrite a newer remote head', async () => {
    const fixture = runtimeFixture();
    let loseAck = true;
    const transport: typeof fixture.transport = async (...args) => {
      const response = await fixture.transport(...args);
      if (loseAck && args[0] === 'POST' && args[1].endsWith('/composition-revisions')) {
        loseAck = false;
        throw new Error('response lost after commit');
      }
      return response;
    };
    const local = new RuntimeDataProvider({ projectId: PROJECT_ID, transport });
    const initial = await local.loadTimeline(TIMELINE_ID);
    await expect(local.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!)).rejects.toThrow('response lost');
    const remote = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    const other = await remote.loadTimeline(TIMELINE_ID);
    const config = { ...other.config, tracks: other.config.tracks.map((t) => ({ ...t, label: 'Remote after lost ack' })) };
    await remote.saveTimelineAtHead(TIMELINE_ID, config, other.head!);
    const latest = await local.loadTimeline(TIMELINE_ID);
    await expect(local.saveTimelineAtHead(TIMELINE_ID, initial.config, initial.head!)).rejects.toMatchObject({ code: 'timeline_version_conflict' });
    expect(fixture.read().documentVersion).toBe(3);
    expect((await local.loadTimeline(TIMELINE_ID)).configVersion).toBe(latest.configVersion);
    expect(fixture.read().config.tracks[0]?.label).toBe('Remote after lost ack');
  });

  it('registers simultaneous assets atomically without losing either registry entry', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixture.transport });
    await Promise.all([
      provider.registerAsset(TIMELINE_ID, 'one', { type: 'image', file: 'one.png' }),
      provider.registerAsset(TIMELINE_ID, 'two', { type: 'image', file: 'two.png' }),
    ]);
    expect(Object.keys((await provider.loadAssetRegistry(TIMELINE_ID)).assets)).toEqual(['one', 'two']);
    expect(fixture.read().documentVersion).toBe(3);
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
    const placedVersion = await provider.saveTimelineAtHead(
      TIMELINE_ID,
      placedConfig,
      afterUpload.head!,
      registry,
    );
    const persisted = await provider.loadTimeline(TIMELINE_ID);
    const persistedRegistry = await provider.loadAssetRegistry(TIMELINE_ID);

    expect(placedVersion.configVersion).toBe(3);
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
    const initialSavedVersion = await provider.saveTimelineAtHead(
      TIMELINE_ID,
      initialConfig,
      afterInitialIngest.head!,
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
    const winningVersion = await provider.saveTimelineAtHead(
      TIMELINE_ID,
      winningConfig,
      initialSavedVersion.head,
      await provider.loadAssetRegistry(TIMELINE_ID),
    );

    await expect(staleProvider.saveTimelineAtHead(
      TIMELINE_ID,
      { ...staleInitial.config, clips: [] },
      staleInitial.head!,
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
    expect(winningVersion.configVersion).toBe(3);
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

  it('returns a playable locator for a freshly prepared object before registry readback', async () => {
    const fixture = runtimeFixture();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', token: 'fixture-token', transport: fixture.transport });

    const prepared = await provider.prepareAsset(
      new File(['managed creative'], 'managed-creative.mp4', { type: 'video/mp4' }),
      { timelineId: TIMELINE_ID, userId: 'owner-r3' },
    );

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
    await provider.saveTimelineAtHead(TIMELINE_ID, firstEdit, initial.head!);
    const staleEdit = { ...initial.config, tracks: initial.config.tracks.map((track, index) => index === 0 ? { ...track, label: 'Stale V1' } : track) };

    await expect(provider.saveTimelineAtHead(TIMELINE_ID, staleEdit, initial.head!)).rejects.toMatchObject({
      name: 'TimelineVersionConflictError',
      code: 'timeline_version_conflict',
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

  it('surfaces a storage admission failure instead of misclassifying it as a timeline conflict', async () => {
    const fixture = runtimeFixture();
    const onRuntimeError = vi.fn();
    const publishPath = `/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/composition-revisions`;
    const provider = new RuntimeDataProvider({
      projectId: PROJECT_ID,
      baseUrl: 'http://runtime.test',
      token: 'fixture-token',
      onRuntimeError,
      transport: async (method, path, headers, body) => {
        if (method === 'POST' && path === publishPath) {
          return {
            status: 409,
            headers: {},
            body: json({
              code: 'realm_admission_failed',
              message: 'Runtime realm admission failed',
              details: {
                checks: {
                  sqlite: { result: 'error: [Errno 28] No space left on device' },
                },
              },
            }),
          };
        }
        return fixture.transport(method, path, headers, body);
      },
    });
    const initial = await provider.loadTimeline(TIMELINE_ID);
    const edited = {
      ...initial.config,
      tracks: initial.config.tracks?.map((track, index) => (
        index === 0 ? { ...track, label: 'Storage failure' } : track
      )),
    };

    await expect(provider.saveTimelineAtHead(TIMELINE_ID, edited, initial.head!)).rejects.toMatchObject({
      code: 'runtime_unavailable',
      causeCode: 'realm_admission_failed',
      failureKind: 'storage',
      status: 409,
    });
    expect(onRuntimeError).toHaveBeenCalledWith(expect.objectContaining({
      code: 'runtime_unavailable',
      recoveryAction: 'Check the Runtime data volume and restart it, then retry; your timeline draft is preserved.',
    }));
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
