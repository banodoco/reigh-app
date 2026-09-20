import type { AgentChatEditorContext } from '@/shared/contexts/AgentChatContext.tsx';
import type { AgentTurnAttachment } from '@/tools/video-editor/types/agent-session.ts';
import type { ReighAgentElementContext } from './element-contract.ts';

export const REIGH_AGENT_CONTEXT_SCHEMA = 'reigh.editor-context/v1';

export type ReighAgentContextSnapshot = {
  schema: typeof REIGH_AGENT_CONTEXT_SCHEMA;
  request_id: string;
  context_revision: string;
  captured_at: string;
  project: {
    id: string | null;
    slug: string | null;
  };
  timeline: {
    id: string;
    name: string | null;
    summary?: {
      config_version: number;
      track_count: number;
      clip_count: number;
      asset_count: number;
      duration: number;
    };
  };
  elements?: ReighAgentElementContext;
  editor: {
    tool: 'video-editor';
    deep_link: string | null;
  };
  selection?: {
    clip_ids: string[];
    assets: Array<{
      clip_id: string;
      media_type: AgentTurnAttachment['mediaType'];
      generation_id?: string;
      variant_id?: string;
      shot_id?: string;
      track_id?: string;
      at?: number;
      duration?: number;
    }>;
  };
  tool_access: {
    authority: 'astrid-runtime';
    families: ['projects', 'timelines', 'media', 'tasks', 'runs', 'elements'];
    instructions: string[];
  };
};

function hashRevision(value: string): string {
  // A small deterministic, non-cryptographic revision is enough to identify
  // the editor snapshot. It is deliberately not treated as authorization or
  // as the document's persistence version.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function requestId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function currentDeepLink(): string | null {
  return typeof globalThis.location?.href === 'string' ? globalThis.location.href : null;
}

export function buildReighAgentContextSnapshot(
  editorContext: AgentChatEditorContext,
  attachments: readonly AgentTurnAttachment[] = [],
): ReighAgentContextSnapshot {
  const assets = attachments.map((attachment) => ({
    clip_id: attachment.clipId,
    media_type: attachment.mediaType,
    ...(attachment.generationId ? { generation_id: attachment.generationId } : {}),
    ...(attachment.variantId ? { variant_id: attachment.variantId } : {}),
    ...(attachment.shotId ? { shot_id: attachment.shotId } : {}),
    ...(attachment.trackId ? { track_id: attachment.trackId } : {}),
    ...(attachment.at === undefined ? {} : { at: attachment.at }),
    ...(attachment.duration === undefined ? {} : { duration: attachment.duration }),
  }));
  const revisionInput = JSON.stringify({
    projectId: editorContext.projectId,
    projectSlug: editorContext.projectSlug,
    timelineId: editorContext.timelineId,
    timelineName: editorContext.timelineName,
    timelineSummary: editorContext.timelineSummary,
    assets,
    elementContext: editorContext.elementContext,
  });

  return {
    schema: REIGH_AGENT_CONTEXT_SCHEMA,
    request_id: requestId(),
    context_revision: hashRevision(revisionInput),
    captured_at: new Date().toISOString(),
    project: {
      id: editorContext.projectId,
      slug: editorContext.projectSlug,
    },
    timeline: {
      id: editorContext.timelineId,
      name: editorContext.timelineName,
      ...(editorContext.timelineSummary
        ? {
            summary: {
              config_version: editorContext.timelineSummary.configVersion,
              track_count: editorContext.timelineSummary.trackCount,
              clip_count: editorContext.timelineSummary.clipCount,
              asset_count: editorContext.timelineSummary.assetCount,
              duration: editorContext.timelineSummary.duration,
            },
          }
        : {}),
    },
    editor: {
      tool: 'video-editor',
      deep_link: editorContext.deepLink ?? currentDeepLink(),
    },
    ...(assets.length > 0
      ? {
          selection: {
            clip_ids: assets.map((asset) => asset.clip_id),
            assets,
          },
        }
      : {}),
    ...(editorContext.elementContext ? { elements: editorContext.elementContext } : {}),
    tool_access: {
      authority: 'astrid-runtime',
    families: ['projects', 'timelines', 'media', 'tasks', 'runs', 'elements'],
      instructions: [
        'Use the Astrid runtime tools available in this session; do not infer project or asset state from the filesystem.',
        'Use the compact timeline summary in this context for orientation; use the full timeline/asset registry only when the requested operation needs details that are not present here.',
        'For mutations, use an explicit project and timeline scope plus the returned document version/CAS contract.',
        'Resolve the full timeline asset registry through Astrid tools instead of expecting this prompt to contain every asset.',
        'Treat project and timeline IDs as resource references, not as authorization.',
        'Use the supplied Elements catalog and selected-cut context before asking the runtime for another discovery read.',
        'Prefer a registered element and one typed timeline operation. Use timeline.set_clip_fade for clip fade timing; do not model a fade as a transition.',
        'Transitions are relationships between adjacent clips. Use timeline.apply_transition with from_clip, to_clip, an element revision, and duration_frames; never silently substitute another transition.',
        'When new code is genuinely required, create a draft, validate it, and apply the pinned revision for immediate preview. Do not put raw Remotion source into timeline JSON or publish silently.',
        'The Reigh host executes Elements edits only from <reigh_element_operation>{valid JSON}</reigh_element_operation> blocks in your final assistant message. Emit one block per typed operation, in order; do not describe an operation as completed unless the host result is returned.',
        'For a new draft, emit elements.create_draft, elements.validate, then the timeline operation. Draft revisions are deterministic as draft-<id>; a draft is browser-preview-only until explicitly published.',
      ],
    },
  };
}

export function serializeReighAgentContext(snapshot: ReighAgentContextSnapshot): string {
  return [
    '<reigh_editor_context>',
    JSON.stringify(snapshot, null, 2),
    '</reigh_editor_context>',
  ].join('\n');
}
