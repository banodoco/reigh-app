import { ASTRID_RENDERING_ELEMENTS } from '@astrid/packs/rendering/elements/catalog.ts';
import type { TimelineEditability } from '@/tools/video-editor/lib/timeline-editability.ts';
import type { ResolvedTimelineClip } from '@/tools/video-editor/types/index.ts';

export type AstridElementParamDescriptor = (typeof ASTRID_RENDERING_ELEMENTS)[number];

/** Resolve only the editable schema for a clip's exact pinned element identity. */
export function resolveAstridElementParamDescriptor(
  clip: Pick<ResolvedTimelineClip, 'id' | 'track' | 'elementRef'> | null,
  readOnly: boolean | undefined,
  timelineEditability: TimelineEditability | undefined,
): AstridElementParamDescriptor | undefined {
  const reference = clip?.elementRef;
  if (!clip || !reference || readOnly) return undefined;

  const timelinePermission = timelineEditability?.checkTimeline?.();
  const clipPermission = timelineEditability?.check({
    clipId: clip.id,
    sourceTrackId: clip.track,
    targetTrackId: clip.track,
  });
  if (timelinePermission?.allowed === false || clipPermission?.allowed === false) return undefined;

  const descriptor = ASTRID_RENDERING_ELEMENTS.find((candidate) => (
    candidate.id === reference.id
    && candidate.kind === reference.kind
    && candidate.revision === reference.revision
    && candidate.packId === reference.packId
  ));
  const schemaProperties = (descriptor?.schema as { properties?: Record<string, unknown> } | undefined)?.properties;
  return schemaProperties && Object.keys(schemaProperties).length > 0 ? descriptor : undefined;
}
