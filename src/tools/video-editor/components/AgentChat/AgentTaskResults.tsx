import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AstridRuntimeClient } from '@/integrations/runtime/client';
import { runtimeGenerationToGalleryItem, listAllRuntimeVariants } from '@/integrations/runtime/generationAccess';
import type { Generation, ManagedOutput, Page } from '@/integrations/runtime/generated';
import type { AstridTaskRef } from '../../runtime/agentTaskLinks';

export type LinkedTaskResult = { id: string; name: string; url: string; mediaType: string; generationId?: string };

async function collectPages<T>(fetch: (cursor?: string) => Promise<Page<T>>): Promise<T[]> {
  const rows: T[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await fetch(cursor);
    rows.push(...page.items);
    const next = page.next_cursor;
    if (next !== null && seen.has(next)) throw new Error('Runtime result pagination repeated a cursor');
    if (next !== null) seen.add(next);
    cursor = next ?? undefined;
  } while (cursor);
  return rows;
}

/** Verify the whole admitted identity before showing canonical Runtime output. */
export async function loadLinkedTaskResults(ref: AstridTaskRef, client = new AstridRuntimeClient()): Promise<LinkedTaskResult[]> {
  const task = await client.getTask(ref.task_id);
  if (task.project_id !== ref.project_id || task.run_id !== ref.run_id || task.capability_id !== ref.capability_id) {
    throw new Error('The linked task does not belong to this chat action.');
  }
  const [generations, outputs] = await Promise.all([
    collectPages<Generation>(cursor => client.listGenerations(ref.project_id, cursor, 200)),
    collectPages<ManagedOutput>(cursor => client.listManagedOutputs(ref.task_id, cursor, 200)),
  ]);
  const results: LinkedTaskResult[] = [];
  const objects = new Set<string>();
  for (const generation of generations) {
    if (generation.project_id !== ref.project_id || generation.source_task_id !== ref.task_id) continue;
    const variants = await listAllRuntimeVariants(client, generation.generation_id);
    const item = runtimeGenerationToGalleryItem(client, generation, variants);
    if (!item.url) continue;
    results.push({ id: generation.generation_id, generationId: generation.generation_id,
      name: typeof generation.metadata.name === 'string' ? generation.metadata.name : 'Generated result',
      url: item.url, mediaType: item.contentType ?? (item.isVideo ? 'video/*' : 'image/*') });
    for (const variant of variants) if (variant.object_id) objects.add(variant.object_id);
  }
  for (const output of outputs) {
    if (output.project_id !== ref.project_id || output.run_id !== ref.run_id || output.task_id !== ref.task_id
      || output.state !== 'available' || output.role === 'thumbnail' || objects.has(output.object_id)) continue;
    results.push({ id: output.association_id, name: output.filename,
      url: client.objectContentUrl(output.object_id), mediaType: output.media_type });
  }
  return results;
}

function LinkedTaskResults({ taskRef }: { taskRef: AstridTaskRef }) {
  const query = useQuery({
    queryKey: ['agent-linked-task-results', taskRef.project_id, taskRef.run_id, taskRef.task_id, taskRef.capability_id],
    queryFn: () => loadLinkedTaskResults(taskRef),
    refetchInterval: 5_000,
    retry: false,
  });
  if (query.error) return <p className="text-xs text-muted-foreground" role="status">Linked results are unavailable.</p>;
  if (!query.data?.length) return null;
  return <div className="flex flex-wrap gap-2" data-linked-task-id={taskRef.task_id}>
    {query.data.map(result => <figure key={result.id} className="max-w-full rounded-lg border border-border bg-card/60 p-2" data-linked-result-id={result.id}>
      {result.mediaType.startsWith('video/') ? <video src={result.url} controls preload="metadata" className="max-h-40 max-w-full rounded" />
        : result.mediaType.startsWith('image/') ? <img src={result.url} alt={result.name} className="max-h-40 max-w-full rounded" />
          : result.mediaType.startsWith('audio/') ? <audio src={result.url} controls preload="metadata" /> : null}
      <figcaption className="mt-1 truncate text-xs"><a href={result.url} target="_blank" rel="noreferrer" className="underline">{result.name}</a></figcaption>
    </figure>)}
  </div>;
}

export function AgentTaskResults({ refs, projectId }: { refs: readonly AstridTaskRef[]; projectId: string | null }) {
  const scoped = useMemo(() => refs.filter(ref => ref.project_id === projectId), [refs, projectId]);
  return <>{scoped.map(ref => <LinkedTaskResults key={`${ref.run_id}:${ref.task_id}`} taskRef={ref} />)}</>;
}
