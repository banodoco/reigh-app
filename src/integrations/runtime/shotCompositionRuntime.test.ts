import { describe, expect, it, vi } from 'vitest';
import { createFakeIndexedDB, resetFakeIndexedDB } from 'fake-indexeddb';
import fixture from '@/tools/video-editor/data/shotComposition.fixture.json';
import { RuntimeDataProvider } from './dataProvider.ts';
import { StaleWriteError } from '@/tools/video-editor/data/shotComposition.ts';
import { createShotCompositionAdapter } from '@/tools/video-editor/data/shotCompositionAdapter.ts';
import { projectCanonicalComposition } from '@/tools/video-editor/data/shotCompositionProjection.ts';
import { createShotTimelineDataProvider } from '@/tools/travel-between-images/components/shotTimelineDataProvider.ts';
import { clearTimelineDraft, loadTimelineDraft } from '@/tools/video-editor/data/timelineDraftIndexedDb.ts';

const PROJECT_ID = 'project-001';
const TIMELINE_ID = 'document-primary';

vi.stubGlobal('indexedDB', createFakeIndexedDB());

function json(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function runtimeResponses(options: {
  headRevisionId?: string;
  childAssets?: Record<string, Record<string, unknown>>;
  manifestAudioAsset?: boolean;
} = {}) {
  const headRevisionId = options.headRevisionId ?? 'timeline-rev-2';
  const graph = fixture as Record<string, any>;
  const revisions = graph.shot_revisions as Array<Record<string, any>>;
  const occurrences = (graph.occurrences as Array<Record<string, any>>).map((occurrence) => ({
    occurrence_id: occurrence.occurrence_id,
    shot_id: occurrence.shot_id,
    shot_revision_id: occurrence.revision_id,
    placement: { start_ms: occurrence.at_ms },
    source_offset: 0,
    duration_ms: occurrence.duration_ms,
    speed: 1,
    track: 'video',
    transform: {},
    gain: 1,
    mute: false,
    provenance: {},
  }));
  const parent = {
    revision_id: headRevisionId,
    project_id: PROJECT_ID,
    timeline_id: TIMELINE_ID,
    content_digest: graph.primary_timeline.head.content_digest,
    payload: { config: {}, registry: {}, clips: [], occurrences },
    created_at: '2026-09-19T00:00:00Z',
  };
  const shots = new Map<string, Record<string, any>>();
  const internals = new Map<string, Record<string, any>>();
  for (const revision of revisions) {
    const key = `${revision.shot_id}\u0000${revision.revision_id}`;
    shots.set(key, {
      revision_id: revision.revision_id,
      project_id: PROJECT_ID,
      shot_id: revision.shot_id,
      internal_timeline_revision_id: revision.internal_timeline_revision.revision_id,
      content_digest: revision.content_digest,
      payload: {
        assets: revision.shot_id === 'shot-alpha' && options.manifestAudioAsset
          ? [...revision.assets, {
              asset_id: 'alpha-audio',
              object_id: 'object-alpha-audio',
              digest: 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
              role: 'audio',
              scope: { project_id: PROJECT_ID },
            }]
          : revision.assets,
        generation_inputs: revision.generation_inputs,
        timing: revision.timing,
        audio: revision.audio,
        dependencies: revision.dependencies,
        provenance: revision.provenance,
      },
      created_at: '2026-09-19T00:00:00Z',
    });
    internals.set(revision.internal_timeline_revision.revision_id, {
      revision_id: revision.internal_timeline_revision.revision_id,
      project_id: PROJECT_ID,
      timeline_id: TIMELINE_ID,
      content_digest: revision.internal_timeline_revision.content_digest,
      payload: revision.shot_id === 'shot-alpha' && options.childAssets
        ? { ...revision.internal_timeline_revision.timeline, assets: options.childAssets }
        : revision.internal_timeline_revision.timeline,
      created_at: '2026-09-19T00:00:00Z',
    });
  }
  return { graph, parent, occurrences, shots, internals };
}

function fixtureTransport(options: {
  conflict?: boolean;
  initialHeadRevisionId?: string | null;
  legacyInternalScope?: boolean;
  childAssets?: Record<string, Record<string, unknown>>;
  manifestAudioAsset?: boolean;
  commitThenLoseFirstResponse?: boolean;
} = {}) {
  const responses = runtimeResponses({
    childAssets: options.childAssets,
    manifestAudioAsset: options.manifestAudioAsset,
  });
  let currentHeadRevisionId = options.initialHeadRevisionId === undefined
    ? responses.parent.revision_id
    : options.initialHeadRevisionId;
  const requests: Array<{ method: string; path: string; headers: Record<string, string>; body?: Record<string, unknown> }> = [];
  const committedParents = new Map<string, Record<string, unknown>>();
  const committedShots = new Map<string, Record<string, unknown>>();
  const committedInternals = new Map<string, Record<string, unknown>>();
  const durableReceipts = new Map<string, Record<string, unknown>>();
  let lostFirstResponse = false;
  const transport = async (method: string, path: string, headers: Record<string, string>, body?: Uint8Array) => {
    const parsedBody = body ? JSON.parse(new TextDecoder().decode(body)) as Record<string, unknown> : undefined;
    requests.push({ method, path, headers, ...(parsedBody ? { body: parsedBody } : {}) });
    if (path === '/v1/health') return { status: 200, headers: {}, body: json({ status: 'ok', protocol: 'workspace.v1', schema_digest: 'sha256:test', runtime_epoch: 1 }) };
    if (path === '/v1/handshake') return { status: 200, headers: {}, body: json({ protocol: 'workspace.v1', schema_digest: 'sha256:test', session_id: 'session', actor_id: 'owner', realm_id: 'realm', scopes: ['projects:read', 'projects:write'] }) };
    if (path === '/v1/realm') return { status: 200, headers: {}, body: json({ realm_id: 'realm', display_name: 'fixture', version: 1, created_at: '2026-09-19T00:00:00Z' }) };
    if (method === 'GET' && path === `/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}`) return { status: 200, headers: {}, body: json({ timeline_id: TIMELINE_ID, project_id: PROJECT_ID, version: 1, head_revision_id: currentHeadRevisionId, archived: false, shots: [], references: [] }) };
    const compositionRevisionId = path.match(/\/composition-revisions\/([^/]+)$/)?.[1];
    if (compositionRevisionId && committedParents.has(compositionRevisionId)) {
      return { status: 200, headers: {}, body: json(committedParents.get(compositionRevisionId)) };
    }
    if (path === `/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/composition-revisions/${responses.parent.revision_id}`) return { status: 200, headers: {}, body: json(responses.parent) };
    if (path.startsWith(`/v1/projects/${PROJECT_ID}/shots/`) && path.includes('/revisions/')) {
      const [, shotId, revisionId] = path.match(/\/shots\/([^/]+)\/revisions\/([^/]+)$/) ?? [];
      return { status: 200, headers: {}, body: json(committedShots.get(`${shotId}\u0000${revisionId}`) ?? responses.shots.get(`${shotId}\u0000${revisionId}`)) };
    }
    if (path.startsWith(`/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/revisions/`)) {
      if (options.legacyInternalScope) return { status: 404, headers: {}, body: json({ code: 'not_found', message: 'legacy child scope' }) };
      const revisionId = path.split('/').pop() ?? '';
      return { status: 200, headers: {}, body: json(committedInternals.get(revisionId) ?? responses.internals.get(revisionId)) };
    }
    if (path.startsWith(`/v1/projects/${PROJECT_ID}/timelines/${encodeURIComponent('shot:')}`)) {
      const match = path.match(/\/timelines\/shot%3A([^/]+)\/revisions\/([^/]+)$/);
      if (!match) throw new Error(`unexpected legacy internal path ${path}`);
      const revision = responses.internals.get(decodeURIComponent(match[2]));
      return { status: 200, headers: {}, body: json({ ...revision, timeline_id: `shot:${decodeURIComponent(match[1])}` }) };
    }
    if (method === 'POST' && path === `/v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/composition-revisions`) {
      if (options.commitThenLoseFirstResponse) {
        const idempotencyKey = headers['Idempotency-Key'];
        let receipt = durableReceipts.get(idempotencyKey);
        if (!receipt) {
          if (parsedBody?.expected_head !== currentHeadRevisionId) {
            return { status: 409, headers: {}, body: json({ code: 'conflict', message: 'head moved' }) };
          }
          const parentRevisionId = String(parsedBody?.parent_revision_id);
          const parentComposition = parsedBody?.parent_composition as Record<string, unknown>;
          const payload = {
            config: parentComposition.config,
            registry: parentComposition.registry,
            clips: parentComposition.clips,
            occurrences: parentComposition.occurrences,
          };
          committedParents.set(parentRevisionId, {
            revision_id: parentRevisionId,
            project_id: PROJECT_ID,
            timeline_id: TIMELINE_ID,
            content_digest: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            payload,
            created_at: '2026-09-19T00:00:00Z',
          });
          for (const raw of parsedBody?.shot_revisions as Array<Record<string, unknown>>) {
            committedShots.set(`${String(raw.shot_id)}\u0000${String(raw.revision_id)}`, {
              revision_id: raw.revision_id,
              project_id: PROJECT_ID,
              shot_id: raw.shot_id,
              internal_timeline_revision_id: raw.internal_timeline_revision_id,
              content_digest: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
              payload: raw.payload,
              created_at: '2026-09-19T00:00:00Z',
            });
          }
          for (const raw of parsedBody?.internal_timeline_revisions as Array<Record<string, unknown>>) {
            committedInternals.set(String(raw.revision_id), {
              revision_id: raw.revision_id,
              project_id: PROJECT_ID,
              timeline_id: raw.timeline_id,
              content_digest: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
              payload: raw.payload,
              created_at: '2026-09-19T00:00:00Z',
            });
          }
          currentHeadRevisionId = parentRevisionId;
          receipt = {
            data: { revision_id: parentRevisionId },
            receipt: {
              receipt_id: 'popup-receipt',
              command_kind: 'parent_composition.publish',
              idempotency_key: idempotencyKey,
              request_hash: 'popup-request-hash',
              project_id: PROJECT_ID,
              project_seq: [2, 2],
              event_ids: ['popup-event'],
              result: { dependency_manifest: {}, content_digests: {} },
              created_at: '2026-09-19T00:00:00Z',
            },
          };
          durableReceipts.set(idempotencyKey, receipt);
          if (!lostFirstResponse) {
            lostFirstResponse = true;
            throw new Error('connection dropped after durable commit');
          }
        }
        return { status: 200, headers: {}, body: json(receipt) };
      }
      if (options.conflict) return { status: 409, headers: {}, body: json({ code: 'conflict', message: 'head moved' }) };
      // Simulate a concurrent writer winning immediately after this commit.
      // The provider must still resolve the receipt's returned head below.
      currentHeadRevisionId = 'timeline-rev-future';
      return { status: 200, headers: {}, body: json({ data: { revision_id: responses.parent.revision_id }, receipt: { receipt_id: 'receipt', command_kind: 'parent_composition.publish', idempotency_key: 'key', request_hash: 'hash', project_id: PROJECT_ID, project_seq: [1, 1], event_ids: ['event'], result: { dependency_manifest: { shots: [{ shot_id: 'shot-alpha', revision_id: 'rev-a', internal_timeline_revision_id: 'timeline-alpha-a', content_digest: 'sha256:aaa' }], media: [{ content_digest: 'sha256:bbb' }] }, content_digests: { 'rev-a': 'sha256:aaa' } }, created_at: '2026-09-19T00:00:00Z' } }) };
    }
    throw new Error(`unexpected ${method} ${path}`);
  };
  return { transport, requests };
}

describe('Runtime shot-composition port', () => {
  it('replays a lost popup publication through Runtime with the same candidate and preserves stale-head drafts', async () => {
    resetFakeIndexedDB();
    const fixtureRuntime = fixtureTransport({ commitThenLoseFirstResponse: true });
    const runtime = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixtureRuntime.transport });
    const adapter = createShotCompositionAdapter(runtime.shotComposition);
    const composition = adapter.prepare(await runtime.shotComposition.load({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID }));
    const localComposition = { ...composition, occurrences: [composition.occurrences.find((item) => item.occurrenceId === 'occ-1')!] };
    const config = projectCanonicalComposition(localComposition).config;
    const recoveryId = `${TIMELINE_ID}:shot:occ-1`;
    const firstPopup = createShotTimelineDataProvider(config, composition, 'occ-1', adapter);

    await expect(firstPopup.saveTimeline(recoveryId, config, 1)).rejects.toThrow('connection dropped after durable commit');
    const firstPublish = fixtureRuntime.requests.find((request) => request.method === 'POST' && request.path.includes('/composition-revisions'))!;
    const reopenedPopup = createShotTimelineDataProvider(config, composition, 'occ-1', adapter);
    await reopenedPopup.loadTimeline(recoveryId);
    await expect(reopenedPopup.saveTimeline(recoveryId, config, 1)).resolves.toBe(2);

    const publishRequests = fixtureRuntime.requests.filter((request) => request.method === 'POST' && request.path.includes('/composition-revisions'));
    expect(publishRequests).toHaveLength(2);
    expect(publishRequests[1]?.headers['Idempotency-Key']).toBe(firstPublish.headers['Idempotency-Key']);
    expect(publishRequests[1]?.body?.parent_revision_id).toBe(firstPublish.body?.parent_revision_id);
    expect(publishRequests[1]?.body).toEqual(firstPublish.body);

    const stalePopup = createShotTimelineDataProvider(config, composition, 'occ-1', adapter);
    const newerDraft = { ...config, clips: config.clips.map((clip) => ({ ...clip, hold: 2.25 })) };
    await expect(stalePopup.saveTimeline(recoveryId, newerDraft, 1)).rejects.toMatchObject({ code: 'stale_write' });
    const recovery = await loadTimelineDraft(recoveryId);
    expect(recovery?.draft).toMatchObject({
      config: newerDraft,
      canonicalPublication: { expectedHeadRevisionId: composition.headRevisionId },
    });
    await clearTimelineDraft(recoveryId);
  });

  it('reads the project-scoped head and exact immutable closure', async () => {
    const fixtureRuntime = fixtureTransport();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixtureRuntime.transport });
    const loaded = await provider.shotComposition.load({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID });

    expect(loaded).toMatchObject({ project: { project_id: PROJECT_ID, document_id: TIMELINE_ID }, primary_timeline: { head: { revision_id: 'timeline-rev-2' } } });
    expect(fixtureRuntime.requests.map(({ method, path }) => `${method} ${path}`).filter((value) => value.includes('/timelines/') || value.includes('/revisions/'))).toEqual(expect.arrayContaining([
      `GET /v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}`,
      `GET /v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/composition-revisions/timeline-rev-2`,
      `GET /v1/projects/${PROJECT_ID}/shots/shot-alpha/revisions/rev-a`,
      `GET /v1/projects/${PROJECT_ID}/timelines/${TIMELINE_ID}/revisions/timeline-alpha-a`,
    ]));
    expect(fixtureRuntime.requests.some(({ path }) => path.includes('/documents/'))).toBe(false);
  });

  it('normalizes child timeline assets into the pinned revision at the Runtime boundary', async () => {
    const fixtureRuntime = fixtureTransport({
      childAssets: {
        'alpha-audio': {
          media_id: 'object-alpha-audio',
          content_sha256: '3333333333333333333333333333333333333333333333333333333333333333',
          type: 'audio',
        },
      },
    });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixtureRuntime.transport });

    const loaded = await provider.shotComposition.load({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID }) as {
      shot_revisions: Array<Record<string, any>>;
    };
    const alpha = loaded.shot_revisions.find((revision) => revision.shot_id === 'shot-alpha');

    expect(alpha?.assets).toContainEqual(expect.objectContaining({
      asset_id: 'alpha-audio',
      object_id: 'object-alpha-audio',
      digest: 'sha256:3333333333333333333333333333333333333333333333333333333333333333',
      role: 'audio',
      scope: { project_id: PROJECT_ID },
    }));
  });

  it('rejects conflicting child and shot asset bindings before projection', async () => {
    const fixtureRuntime = fixtureTransport({
      childAssets: {
        'alpha-image': {
          media_id: 'object-conflicting-image',
          content_sha256: '4444444444444444444444444444444444444444444444444444444444444444',
          type: 'image',
        },
      },
    });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixtureRuntime.transport });

    await expect(provider.shotComposition.load({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID }))
      .rejects.toThrow(/conflicts with object object-alpha-image/);
  });

  it('preserves an explicit manifest audio role when the child registry omits its type', async () => {
    const fixtureRuntime = fixtureTransport({
      manifestAudioAsset: true,
      childAssets: {
        'alpha-audio': {
          media_id: 'object-alpha-audio',
          content_sha256: '3333333333333333333333333333333333333333333333333333333333333333',
        },
      },
    });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixtureRuntime.transport });
    const raw = await provider.shotComposition.load({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID });
    const composition = createShotCompositionAdapter({ load: async () => raw }).prepare(raw);
    const projection = projectCanonicalComposition(composition);
    const audioClip = projection.config.clips.find((clip) => clip.asset === 'alpha-audio');

    expect(audioClip?.assetEntry).toMatchObject({
      file: 'object-alpha-audio',
      type: 'audio',
    });
  });

  it('publishes the complete Runtime body and reloads the committed graph', async () => {
    const fixtureRuntime = fixtureTransport();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixtureRuntime.transport });
    const graph = await provider.shotComposition.load({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID });
    const published = await provider.shotComposition.publish?.({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID, expectedHeadRevisionId: 'timeline-rev-2', graph: graph as any });
    const publication = fixtureRuntime.requests.find((request) => request.method === 'POST' && request.path.includes('/composition-revisions'))?.body;
    expect(publication).toMatchObject({
      project_id: PROJECT_ID,
      timeline_id: TIMELINE_ID,
      expected_head: 'timeline-rev-2',
      parent_revision_id: 'timeline-rev-2',
      parent_composition: expect.any(Object),
      shot_revisions: expect.any(Array),
      internal_timeline_revisions: expect.any(Array),
    });
    expect(publication?.content_digest).toBeUndefined();
    expect(publication?.dependency_manifest).toBeUndefined();
    expect((published as any).publication_receipt).toMatchObject({
      new_head: 'timeline-rev-2',
      changed_identities: expect.arrayContaining(['timeline-rev-2', 'shot-alpha', 'rev-a', 'timeline-alpha-a', 'sha256:bbb']),
    });
    const publishRequest = fixtureRuntime.requests.find((request) => request.method === 'POST' && request.path.includes('/composition-revisions'));
    const generatedKey = publishRequest?.headers['Idempotency-Key'] ?? '';
    expect(generatedKey).toMatch(/^[A-Za-z0-9][A-Za-z0-9._~-]{0,255}$/);
    expect(generatedKey).toMatch(/^reigh\.shot-composition\./);
    // The exact receipt head is read after the POST even though the mutable
    // timeline endpoint now reports a newer concurrent head.
    expect(fixtureRuntime.requests.filter((request) => request.method === 'GET' && request.path.includes('/composition-revisions/')).at(-1)?.path)
      .toContain('/composition-revisions/timeline-rev-2');
  });

  it('reuses a caller-provided idempotency key for lost-response retries', async () => {
    const fixtureRuntime = fixtureTransport();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixtureRuntime.transport });
    const graph = await provider.shotComposition.load({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID });
    const request = {
      projectId: PROJECT_ID,
      parentDocumentId: TIMELINE_ID,
      expectedHeadRevisionId: 'timeline-rev-2',
      idempotencyKey: 'retry-shot-edit-1',
      graph: graph as any,
    };
    await provider.shotComposition.publish?.(request);
    // The timeline endpoint now reports a newer head, but Runtime's durable
    // idempotency replay is allowed to return the original receipt.
    await expect(provider.shotComposition.publish?.(request)).resolves.toBeDefined();
    expect(fixtureRuntime.requests.filter((entry) => entry.method === 'POST' && entry.path.includes('/composition-revisions')))
      .toHaveLength(2);
    expect(fixtureRuntime.requests.filter((entry) => entry.method === 'POST' && entry.path.includes('/composition-revisions'))
      .every((entry) => entry.headers['Idempotency-Key'] === 'retry-shot-edit-1')).toBe(true);
  });

  it('publishes a prepared graph against a null initial Runtime head', async () => {
    const fixtureRuntime = fixtureTransport({ initialHeadRevisionId: null });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixtureRuntime.transport });

    await provider.shotComposition.publish?.({
      projectId: PROJECT_ID,
      parentDocumentId: TIMELINE_ID,
      expectedHeadRevisionId: null,
      graph: fixture as any,
    });

    const publication = fixtureRuntime.requests.find((request) => request.method === 'POST' && request.path.includes('/composition-revisions'))?.body;
    expect(publication).toMatchObject({ expected_head: null });
  });

  it('falls back to the legacy shot timeline scope for immutable internal revisions', async () => {
    const fixtureRuntime = fixtureTransport({ legacyInternalScope: true });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixtureRuntime.transport });

    await provider.shotComposition.load({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID });

    const internalReads = fixtureRuntime.requests
      .map(({ method, path }) => `${method} ${path}`)
      .filter((value) => value.includes('/revisions/'));
    expect(internalReads.some((value) => value.includes(`/timelines/${TIMELINE_ID}/revisions/`))).toBe(true);
    expect(internalReads.some((value) => value.includes('/timelines/shot%3A'))).toBe(true);
    expect(fixtureRuntime.requests.some(({ path }) => path.includes('/documents/') || path.startsWith('/v1/timelines/'))).toBe(false);
  });

  it('rejects a publication graph with foreign project identity before the Runtime read', async () => {
    const fixtureRuntime = fixtureTransport();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixtureRuntime.transport });
    const graph = JSON.parse(JSON.stringify(fixture)) as Record<string, any>;
    graph.project.project_id = 'project-foreign';

    await expect(provider.shotComposition.publish?.({
      projectId: PROJECT_ID,
      parentDocumentId: TIMELINE_ID,
      expectedHeadRevisionId: 'timeline-rev-2',
      graph: graph as any,
    })).rejects.toThrow(/publication graph belongs to project/);
    expect(fixtureRuntime.requests).toHaveLength(0);
  });

  it('maps Runtime 409 to the existing stale-write error', async () => {
    const fixtureRuntime = fixtureTransport({ conflict: true });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, transport: fixtureRuntime.transport });
    const graph = await provider.shotComposition.load({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID });
    await expect(provider.shotComposition.publish?.({ projectId: PROJECT_ID, parentDocumentId: TIMELINE_ID, expectedHeadRevisionId: 'timeline-rev-2', graph: graph as any }))
      .rejects.toBeInstanceOf(StaleWriteError);
  });
});
