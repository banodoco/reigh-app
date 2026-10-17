import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProjectChatRegistry } from './astrid-project-chat.ts';
import { ApiError, type Project } from '../src/integrations/runtime/generated.ts';

test('identical draft retries acknowledge without writes while divergent stale payloads retain CAS protection', async () => {
  let project: Project = { project_id: 'p', realm_id: 'r', slug: 'p', name: 'p', metadata: {}, version: 1, created_at: '', updated_at: '' };
  let writes = 0;
  const registry = new ProjectChatRegistry({
    getProject: async () => structuredClone(project),
    listProjects: async () => ({ items: [structuredClone(project)], next_cursor: null }),
    updateProject: async (_id, _key, version, _name, metadata) => {
      assert.equal(version, project.version);
      writes++;
      project = { ...project, version: version + 1, metadata: metadata! };
      return structuredClone(project);
    },
  }, 'test');
  const queue = [{ id: 'q', text: 'queued', session_id: 's', attachments: [{ object_id: 'asset-a', variant: { id: 'v1' } }] }];
  assert.equal((await registry.draft('p', 0, '', [])).draft.revision, 0);
  assert.equal(writes, 0);
  const first = await registry.draft('p', 0, 'local', queue);
  assert.equal(first.draft.revision, 1);
  const duplicate = await registry.draft('p', 0, 'local', structuredClone(queue));
  assert.deepEqual(duplicate, first);
  assert.equal(writes, 1);
  for (const changed of [
    { text: 'other', queue },
    { text: 'local', queue: [] },
    { text: 'local', queue: [{ ...queue[0], session_id: 'other-session' }] },
    { text: 'local', queue: [{ ...queue[0], attachments: [{ object_id: 'asset-b', variant: { id: 'v1' } }] }] },
  ]) {
    await assert.rejects(registry.draft('p', 0, changed.text, changed.queue), (error: unknown) => Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'draft_conflict'));
    assert.deepEqual(await registry.get('p'), first);
  }
  assert.equal(writes, 1);
});

test('parallel identical drafts survive project version retries without advancing twice', async () => {
  let project: Project = { project_id: 'p', realm_id: 'r', slug: 'p', name: 'p', metadata: {}, version: 1, created_at: '', updated_at: '' };
  let writes = 0;
  const registry = new ProjectChatRegistry({
    getProject: async () => structuredClone(project),
    listProjects: async () => ({ items: [structuredClone(project)], next_cursor: null }),
    updateProject: async (_id, _key, version, _name, metadata) => {
      if (version !== project.version) throw new ApiError(409, 'version_conflict', 'changed');
      writes++;
      project = { ...project, version: version + 1, metadata: metadata! };
      return structuredClone(project);
    },
  }, 'test');
  const [first, second] = await Promise.all([registry.draft('p', 0, 'same', []), registry.draft('p', 0, 'same', [])]);
  assert.deepEqual(first, second);
  assert.equal(writes, 1);
});
