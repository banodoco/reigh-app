import { projectPackContext } from './admitted-elements';
import type { AgentChatEditorContext } from '@/shared/contexts/AgentChatContext.tsx';
import type { AgentTurnAttachment } from '@/tools/video-editor/types/agent-session.ts';
import type { AstridAgentElementContext } from './element-contract.ts';

export const ASTRID_APP_AGENT_CONTEXT_SCHEMA = 'astrid.editor-context/v1';

export type AstridAgentContextSnapshot = {
  schema: typeof ASTRID_APP_AGENT_CONTEXT_SCHEMA;
  request_id: string;
  context_revision: string;
  captured_at: string;
  project: {
    id: string | null;
    slug: string | null;
  };
  timeline: {
    id: string | null;
    name: string | null;
    summary?: {
      config_version: number;
      track_count: number;
      clip_count: number;
      asset_count: number;
      duration: number;
    };
  };
  elements?: AstridAgentElementContext;
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
  project_authoring?: ReturnType<typeof projectPackContext>;
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

export function buildAstridAgentContextSnapshot(
  editorContext: AgentChatEditorContext,
  attachments: readonly AgentTurnAttachment[] = [],
  logicalRequestId?: string,
): AstridAgentContextSnapshot {
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
    schema: ASTRID_APP_AGENT_CONTEXT_SCHEMA,
    request_id: logicalRequestId ?? requestId(),
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
    ...(editorContext.projectId ? {project_authoring: projectPackContext(editorContext.projectId)} : {}),
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
        'Custom elements have one source and execution path: an ordinary V3 project pack admitted to the native compiled host. Never send JSX/code/schema in chat or save it inside timeline JSON. Embedded historical source is migration data and is not executed.',
        'Use project_authoring.inspectCommand to discover the current project pack. If not-created and new code is needed, use initCommand lazily. Read/edit ordinary component/descriptor files, validate/admit with admitCommand, then update the SAME existing clip with the returned owner/kind/id/revision using the supported CLI exact-head update-element command.',
        'Preserve user-authored project preferences verbatim. Generated project_authoring paths and commands are separate discovery metadata, not edits to instructions. Read astrid preferences project --project <project> for current guidance.',
        'Prefer CLI/SDK expected-head timeline publication and its stdout saved-head receipt. Ref-only host operations remain available for admitted refs. Source-only elements.create_draft/validate/publish are unsupported. Only actual save receipts establish completion; do not claim Done from emitted JSON.',
        'Preserve the element ID, clip ID, current params, placement and timing unless explicitly changed. A finite positive duration on update-element changes only a matching effect hold span, never media trim or neighboring clips. An admitted new revision does not replace an old saved pin until explicitly published.',


      ],
    },
  };
}

export function serializeAstridAgentContext(snapshot: AstridAgentContextSnapshot): string {
  return [
    '<astrid_editor_context>',
    JSON.stringify(snapshot, null, 2),
    '</astrid_editor_context>',
  ].join('\n');
}
