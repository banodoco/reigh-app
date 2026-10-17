import type { ResolvedTimelineClip } from '@/tools/video-editor/types/index.ts';

const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** One exact saved owner/revision/source lookup for preview and Inspector. */
export function getPinnedTimelineElement(clip: Pick<ResolvedTimelineClip, 'elementRef'>, app: unknown): (Record<string, unknown> & { source: string }) | undefined {
  const ref = clip.elementRef;
  if (!ref || ref.kind === 'transition' || !record(app) || !record(app.elements)) return undefined;
  const entry = app.elements[ref.id];
  if (!record(entry) || entry.kind !== ref.kind || entry.revision !== ref.revision || entry.packId !== ref.packId) return undefined;
  return typeof entry.source === 'string' && entry.source.trim() ? { ...entry, source: entry.source } : undefined;
}


/** Catalog metadata from exact saved refs; never embeds source in the prompt. */
export function getPinnedTimelineElementDescriptors(clips: readonly Pick<ResolvedTimelineClip, 'elementRef'>[], app: unknown): import('./element-contract.ts').AstridElementCatalogEntry[] {
  const entries: import('./element-contract.ts').AstridElementCatalogEntry[] = [];
  for (const clip of clips) {
    const saved = getPinnedTimelineElement(clip, app); const ref = clip.elementRef;
    if (!saved || !ref || entries.some(e => e.id === ref.id && e.kind === ref.kind && e.revision === ref.revision && e.packId === ref.packId)) continue;
    entries.push({id:ref.id,kind:ref.kind,revision:ref.revision,...(ref.packId ? {packId:ref.packId}:{}),
      label: typeof saved.label === 'string' ? saved.label : ref.id,
      description: typeof saved.description === 'string' ? saved.description : undefined,
      placement:'overlay',publication:'draft',legacy:true,
      ...(Array.isArray(saved.schema) ? {schema:saved.schema as import('../types/index.ts').ParameterSchema}:{}),
      ...(record(saved.defaults) ? {defaults:saved.defaults}:{}),
      capabilities:{browserPreview:'blocked',astridExport:'blocked',workerExport:'blocked'},
    });
  }
  return entries;
}
