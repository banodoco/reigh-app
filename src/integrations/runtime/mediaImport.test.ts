import { describe, expect, it } from 'vitest';
import { RuntimeDataProvider } from './dataProvider.ts';

const PROJECT_ID = 'project-imports';
const ASSET_ID = `sha256:${'a'.repeat(64)}`;

function json(value: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(value));
}

function receipt(key: string) {
  return {
    receipt_id: 'receipt-import',
    command_kind: 'media.import',
    idempotency_key: key,
    request_hash: 'request-hash',
    project_id: PROJECT_ID,
    project_seq: [1, 1],
    event_ids: [],
    result: {},
    created_at: '2026-09-23T00:00:00Z',
  };
}

function createTransport(options: { lostAck?: boolean } = {}) {
  const requests: Array<{ method: string; path: string; headers: Record<string, string>; body?: Uint8Array }> = [];
  let importPostCount = 0;
  const completed = {
    provider: 'runtime' as const,
    project: PROJECT_ID,
    import_operation_id: 'operation-import',
    status: 'completed' as const,
    task_id: 'task-import',
    generation_id: 'generation-import',
    variant_id: 'variant-import',
    asset_id: ASSET_ID,
    entry: { object_id: ASSET_ID, media_type: 'video/mp4', size: 4, filename: 'clip.mp4' },
    provenance: { source: 'external_upload', origin: 'imported' },
    actor_id: 'connector-owner',
    duration_seconds: 2.5,
  };

  const transport = async (method: string, path: string, headers: Record<string, string>, body?: Uint8Array) => {
    requests.push({ method, path, headers, body });
    if (path === '/v1/health') return { status: 200, headers: {}, body: json({ status: 'ok', protocol: 'workspace.v1', schema_digest: 'sha256:test', runtime_epoch: 1 }) };
    if (path === '/v1/handshake') return { status: 200, headers: {}, body: json({ protocol: 'workspace.v1', schema_digest: 'sha256:test', session_id: 'session-import', actor_id: 'connector-owner', realm_id: 'realm-import', scopes: ['handshake', 'projects:read', 'projects:write'] }) };
    if (path === '/v1/realm') return { status: 200, headers: {}, body: json({ realm_id: 'realm-import', display_name: 'imports', version: 1, created_at: '2026-09-23T00:00:00Z' }) };
    if (method === 'POST' && path === `/v1/projects/${PROJECT_ID}/media-imports`) {
      importPostCount += 1;
      expect(headers['Idempotency-Key']).toBeTruthy();
      expect(headers['Content-Type']).toBe('video/mp4');
      expect(headers['X-Original-Name']).toBe('clip.mp4');
      expect(headers['X-Media-Duration-Seconds']).toBe('2.5');
      if (options.lostAck && importPostCount === 1) throw new Error('response lost after commit');
      const result = { ...completed, import_operation_id: headers['Idempotency-Key']! };
      return { status: 201, headers: {}, body: json({ data: result, receipt: receipt(headers['Idempotency-Key']!) }) };
    }
    if (method === 'GET' && path.startsWith(`/v1/projects/${PROJECT_ID}/media-imports/`)) {
      return { status: 200, headers: {}, body: json({ ...completed, import_operation_id: path.split('/').at(-1) }) };
    }
    throw new Error(`unexpected ${method} ${path}`);
  };

  return { transport, requests, get importPostCount() { return importPostCount; } };
}

describe('Runtime media import adapter', () => {
  it('returns one reusable catalog descriptor for local video bytes', async () => {
    localStorage.clear();
    const fixture = createTransport();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', transport: fixture.transport });

    const prepared = await provider.prepareMediaImport(
      new File([new Uint8Array([1, 2, 3, 4])], 'clip.mp4', { type: 'video/mp4' }),
      { durationSeconds: 2.5 },
    );

    expect(prepared).toMatchObject({
      provider: 'runtime',
      project: PROJECT_ID,
      importOperationId: expect.any(String),
      generationId: 'generation-import',
      variantId: 'variant-import',
      assetId: ASSET_ID,
      entry: {
        media_id: ASSET_ID,
        content_sha256: ASSET_ID,
        type: 'video/mp4',
        duration: 2.5,
        generationId: 'generation-import',
        variantId: 'variant-import',
      },
    });
    expect(localStorage.getItem(`reigh.runtime.media-import.v1:${PROJECT_ID}:${prepared.importOperationId}`)).toContain(prepared.importOperationId);
    expect(fixture.requests.filter((request) => request.path.includes('/generations') || request.path.includes('/variants'))).toHaveLength(0);
  });

  it('recovers a lost import acknowledgement by operation lookup without a new key', async () => {
    localStorage.clear();
    const fixture = createTransport({ lostAck: true });
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', transport: fixture.transport });

    const prepared = await provider.prepareMediaImport(
      new File(['bytes'], 'clip.mp4', { type: 'video/mp4' }),
    );
    const postRequests = fixture.requests.filter((request) => request.method === 'POST' && request.path.endsWith('/media-imports'));
    const lookupRequests = fixture.requests.filter((request) => request.method === 'GET' && request.path.includes('/media-imports/'));

    expect(prepared.generationId).toBe('generation-import');
    expect(postRequests).toHaveLength(1);
    expect(lookupRequests).toHaveLength(1);
    expect(postRequests[0]?.headers['Idempotency-Key']).toBe(lookupRequests[0]?.path.split('/').at(-1));
    expect(fixture.importPostCount).toBe(1);
  });

  it('accepts the exact 64 MiB boundary and rejects larger files before operation persistence', async () => {
    localStorage.clear();
    const fixture = createTransport();
    const provider = new RuntimeDataProvider({ projectId: PROJECT_ID, baseUrl: 'http://runtime.test', transport: fixture.transport });

    const exactBoundary = new File(['bytes'], 'clip.mp4', { type: 'video/mp4' });
    Object.defineProperty(exactBoundary, 'size', { value: 64 * 1024 * 1024 });
    await provider.prepareMediaImport(exactBoundary);

    const oversized = new File(['bytes'], 'oversized.mp4', { type: 'video/mp4' });
    Object.defineProperty(oversized, 'size', { value: 64 * 1024 * 1024 + 1 });
    await expect(provider.prepareMediaImport(oversized)).rejects.toThrow(
      'oversized.mp4 exceeds the Workspace Runtime media limit of 64 MiB',
    );
    expect(fixture.importPostCount).toBe(1);
    expect(fixture.requests.some((request) => request.path.includes('oversized.mp4'))).toBe(false);
  });
});
