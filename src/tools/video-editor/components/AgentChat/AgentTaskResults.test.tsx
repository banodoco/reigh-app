import { describe, expect, it, vi } from 'vitest';
import type { AstridRuntimeClient } from '@/integrations/runtime/client';
import { loadLinkedTaskResults } from './AgentTaskResults';
import { buildRenderedTurns } from './AgentChat';

const ref = { project_id: 'project', run_id: 'run', task_id: 'task', capability_id: 'media.clip_extract' };
function client() {
  return {
    getTask: vi.fn(async () => ref),
    listGenerations: vi.fn(async () => ({ items: [], next_cursor: null })),
    listManagedOutputs: vi.fn(async () => ({ items: [], next_cursor: null })),
    listVariants: vi.fn(async () => ({ items: [], next_cursor: null })),
    objectContentUrl: (id: string) => `/objects/${id}`,
  };
}
describe('exact originating call result cards', () => {
  it('pairs concurrent tool results by identity despite reverse completion order', () => {
    const items = buildRenderedTurns([
      { role: 'tool_call', content: 'A', tool_call_id: 'A', timestamp: '1' },
      { role: 'tool_call', content: 'B', tool_call_id: 'B', timestamp: '2' },
      { role: 'tool_result', content: 'B result', tool_call_id: 'B', timestamp: '3', task_refs: [ref] },
      { role: 'tool_result', content: 'A result', tool_call_id: 'A', timestamp: '4' },
      { role: 'assistant', content: 'Actual reply.', timestamp: '5' },
    ]);
    expect(items[0]).toMatchObject({ kind: 'tool_group', pairs: [
      { call: { content: 'A' }, result: { content: 'A result' } },
      { call: { content: 'B' }, result: { content: 'B result', task_refs: [ref] } },
    ] });
    expect(items[1]).toMatchObject({ kind: 'message', turn: { content: 'Actual reply.' } });
  });

  it('loads real managed outputs only for the exact project/run/task', async () => {
    const source = client();
    source.listManagedOutputs.mockResolvedValue({ items: [
      { ...ref, association_id: 'output', filename: 'clip.mp4', object_id: 'sha256:clip', media_type: 'video/mp4', state: 'available', role: 'result' },
      { ...ref, project_id: 'other', association_id: 'wrong', filename: 'wrong.mp4', object_id: 'sha256:wrong', media_type: 'video/mp4', state: 'available', role: 'result' },
    ] as never[], next_cursor: null });
    expect(await loadLinkedTaskResults(ref, source as unknown as AstridRuntimeClient)).toEqual([
      { id: 'output', name: 'clip.mp4', url: '/objects/sha256:clip', mediaType: 'video/mp4' },
    ]);
    source.getTask.mockResolvedValue({ ...ref, run_id: 'other-run' });
    await expect(loadLinkedTaskResults(ref, source as unknown as AstridRuntimeClient)).rejects.toThrow('does not belong');
  });

  it('joins published generation results solely through source_task_id', async () => {
    const source = client();
    source.listGenerations.mockResolvedValue({ items: [
      { generation_id: 'linked', project_id: 'project', source_task_id: 'task', type: 'image', metadata: { name: 'Real generated image' } },
      { generation_id: 'unlinked', project_id: 'project', source_task_id: 'other', type: 'image', metadata: {} },
    ] as never[], next_cursor: null });
    source.listVariants.mockResolvedValue({ items: [{ variant_id: 'variant', generation_id: 'linked', object_id: 'sha256:image', variant_type: 'original', metadata: { media_type: 'image/png', is_primary: true } }] as never[], next_cursor: null });
    const results = await loadLinkedTaskResults(ref, source as unknown as AstridRuntimeClient);
    expect(results).toEqual([{ id: 'linked', generationId: 'linked', name: 'Real generated image', url: '/objects/sha256:image', mediaType: 'image/png' }]);
    expect(source.listVariants).toHaveBeenCalledTimes(1);
  });
});
