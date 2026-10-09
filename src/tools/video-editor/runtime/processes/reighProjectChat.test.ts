import { describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiError, type Project } from '@/integrations/runtime/generated.ts';
import { ProjectChatRegistry } from '../../../../../scripts/reigh-project-chat.ts';

function project(projectId: string, metadata: Record<string, unknown> = {}, version = 1): Project {
  return { project_id: projectId, realm_id: 'realm-a', slug: projectId, name: projectId, metadata, version, created_at: '', updated_at: '' };
}

class MemoryProjects {
  readonly claimDirectory = mkdtempSync(join(tmpdir(), 'reigh-chat-claims-'));
  readonly projects = new Map<string, Project>([['p1', project('p1', { unrelated: { keep: true } })], ['p2', project('p2')]]);
  async getProject(id: string) { const value = this.projects.get(id); if (!value) throw new Error('missing'); return structuredClone(value); }
  async listProjects(cursor?: string, limit = 100) { const items = [...this.projects.values()].slice(cursor ? Number(cursor) : 0, (cursor ? Number(cursor) : 0) + limit); const end = (cursor ? Number(cursor) : 0) + items.length; return { items: structuredClone(items), next_cursor: end < this.projects.size ? String(end) : null }; }
  async updateProject(id: string, _key: string, expected: number, _name?: string, metadata?: Record<string, unknown>) {
    const current = this.projects.get(id);
    if (!current) throw new Error('missing');
    if (current.version !== expected) throw new ApiError(409, 'version_conflict', 'changed');
    const next = { ...current, metadata: structuredClone(metadata ?? current.metadata), version: current.version + 1 };
    this.projects.set(id, next);
    return structuredClone(next);
  }
}

describe('ProjectChatRegistry', () => {
  const registry = (store: MemoryProjects, identity: string) => new ProjectChatRegistry(store as never, identity, Date.now, store.claimDirectory);
  it('persists session association and draft across registry instances, preserving unrelated metadata and isolating projects', async () => {
    const store = new MemoryProjects();
    try {
      const first = registry(store, 'omp-store-a');
      const created = await first.create('p1', 'ensure', 'op-1', async () => ({ sessionId: 'session-1' }));
      const selected = await first.select('p1', created.revision, 'session-1');
      const drafted = await first.draft('p1', selected.draft.revision, 'hello', [{ id: 'q1', text: 'later', session_id: 'session-1' }]);

      const reopened = registry(store, 'omp-store-a');
      expect(await reopened.get('p1')).toMatchObject({ selected_session_id: 'session-1', draft: { text: 'hello', queued_messages: [{ id: 'q1' }] } });
      expect((await reopened.get('p2')).sessions).toEqual([]);
      expect((await store.getProject('p1')).metadata.unrelated).toEqual({ keep: true });
      expect(drafted.draft.revision).toBe(1);
    } finally { rmSync(store.claimDirectory, { recursive: true, force: true }); }
  });

  it('rejects stale selection and draft writes without replacing the newer saved text', async () => {
    const store = new MemoryProjects();
    try {
      const chat = registry(store, 'store');
      const created = await chat.create('p1', 'ensure', 'op', async () => ({ sessionId: 's1' }));
      await chat.select('p1', created.revision, 's1');
      await chat.draft('p1', 0, 'newer');
      await expect(chat.draft('p1', 0, 'stale')).rejects.toMatchObject({ code: 'draft_conflict' });
      await expect(chat.select('p1', created.revision, null)).rejects.toMatchObject({ code: 'chat_conflict' });
      expect((await chat.get('p1')).draft.text).toBe('newer');
    } finally { rmSync(store.claimDirectory, { recursive: true, force: true }); }
  });

  it('uses a CAS claim so simultaneous ensure calls cannot both create defaults', async () => {
    const store = new MemoryProjects();
    try {
      const a = registry(store, 'store');
      const b = registry(store, 'store');
      let calls = 0;
      const create = async () => { calls += 1; await new Promise(resolve => setTimeout(resolve, 1)); return { sessionId: `s${calls}` }; };
      const results = await Promise.allSettled([
        a.create('p1', 'ensure', 'op-a', create),
        b.create('p1', 'ensure', 'op-b', create),
      ]);
      expect(calls).toBe(1);
      expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
      expect((await a.get('p1')).sessions).toHaveLength(1);
    } finally { rmSync(store.claimDirectory, { recursive: true, force: true }); }
  });

  it('replays the operation session identity without changing a later user selection', async () => {
    const store = new MemoryProjects();
    try {
      const chat = registry(store, 'store');
      const first = await chat.create('p1', 'new', 'stable-op', async () => ({ sessionId: 's1' }));
      await chat.create('p1', 'new', 'later-op', async () => ({ sessionId: 's2' }));
      const replay = await chat.create('p1', 'new', 'stable-op', async () => ({ sessionId: 'duplicate' }));
      expect(replay.operation_session_id).toBe('s1');
      expect(replay.selected_session_id).toBe('s2');
      expect(replay.sessions).toHaveLength(2);
      expect(first.selected_session_id).toBe('s1');
    } finally { rmSync(store.claimDirectory, { recursive: true, force: true }); }
  });

  it('marks only definite missing sessions and verifies the next candidate before reuse', async () => {
    const store = new MemoryProjects();
    try {
      const chat = registry(store, 'store');
      let state = await chat.create('p1', 'ensure', 'one', async () => ({ sessionId: 'missing' }));
      state = await chat.create('p1', 'new', 'two', async () => ({ sessionId: 'healthy' }));
      state = await chat.select('p1', state.revision, 'missing');
      const reused = await chat.create('p1', 'ensure', 'ensure-again', async () => ({ sessionId: 'unexpected' }), async id => id === 'healthy');
      expect(reused.selected_session_id).toBe('healthy');
      expect(reused.sessions).toEqual([{ id: 'missing', missing: true }, { id: 'healthy' }]);
      expect(state.sessions).toHaveLength(2);
    } finally { rmSync(store.claimDirectory, { recursive: true, force: true }); }
  });

  it('uses an atomic durable host claim to prevent concurrent cross-project attachment', async () => {
    const store = new MemoryProjects();
    try {
      const a = registry(store, 'shared-omp');
      const b = new ProjectChatRegistry(store as never, 'shared-omp', Date.now, store.claimDirectory);
      const candidates = [{ id: 'legacy-session', title: 'Older chat' }];
      expect(await a.unassigned('p1', candidates)).toEqual(candidates);
      const first = await a.associate('p1', 0, 'legacy-session', async () => true);
      expect(first.selected_session_id).toBe('legacy-session');
      await expect(b.associate('p2', 0, 'legacy-session', async () => true)).rejects.toMatchObject({ code: 'session_already_assigned' });
      expect(await b.unassigned('p2', candidates)).toEqual([]);
      expect((await b.get('p2')).sessions).toEqual([]);
    } finally { rmSync(store.claimDirectory, { recursive: true, force: true }); }
  });
});
