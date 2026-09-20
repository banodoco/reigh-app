import { describe, expect, it } from 'vitest';
import {
  buildReighAgentContextSnapshot,
  serializeReighAgentContext,
} from './reighAgentContext.ts';
import { buildReighAgentElementContext } from './element-contract.ts';

describe('Reigh editor context for Astrid', () => {
  it('keeps the project and timeline explicit without dumping the asset registry', () => {
    const snapshot = buildReighAgentContextSnapshot({
      tool: 'video-editor',
      projectId: 'project-1',
      projectSlug: 'astrid-intro',
      timelineId: 'timeline-1',
      timelineName: 'Main',
      timelineSummary: {
        configVersion: 8,
        trackCount: 3,
        clipCount: 12,
        assetCount: 9,
        duration: 24.5,
      },
      deepLink: 'http://127.0.0.1:2222/tools/video-editor?localProject=astrid-intro&localTimeline=timeline-1',
    }, [{
      clipId: 'clip-1',
      url: 'http://127.0.0.1:2222/private-media.mp4',
      mediaType: 'video',
      generationId: 'generation-1',
      trackId: 'track-1',
      at: 4,
      duration: 2,
    }]);

    expect(snapshot).toMatchObject({
      schema: 'reigh.editor-context/v1',
      project: { id: 'project-1', slug: 'astrid-intro' },
      timeline: {
        id: 'timeline-1',
        name: 'Main',
        summary: {
          config_version: 8,
          track_count: 3,
          clip_count: 12,
          asset_count: 9,
          duration: 24.5,
        },
      },
      editor: { tool: 'video-editor' },
      selection: {
        clip_ids: ['clip-1'],
        assets: [{ clip_id: 'clip-1', generation_id: 'generation-1', track_id: 'track-1' }],
      },
      tool_access: {
        authority: 'astrid-runtime',
        families: ['projects', 'timelines', 'media', 'tasks', 'runs', 'elements'],
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain('private-media.mp4');
  });

  it('includes compact element catalog, selected cuts, and typed operations', () => {
    const snapshot = buildReighAgentContextSnapshot({
      tool: 'video-editor',
      projectId: 'project-1',
      projectSlug: 'astrid-intro',
      timelineId: 'timeline-1',
      timelineName: 'Main',
      timelineSummary: {
        configVersion: 8,
        trackCount: 3,
        clipCount: 12,
        assetCount: 9,
        duration: 24.5,
      },
      elementContext: buildReighAgentElementContext({
        effects: [{ id: 'glow', name: 'Glow', code: 'function Glow() { return null; }' }],
        clips: [
          { id: 'clip-1', trackId: 'picture', at: 0, duration: 2 },
          { id: 'clip-2', trackId: 'picture', at: 2, duration: 2 },
        ],
      }),
    });

    expect(snapshot.elements?.catalog[0]).toMatchObject({ id: 'glow', kind: 'effect' });
    expect(snapshot.elements?.transitionCandidates[0]).toMatchObject({
      fromClipId: 'clip-1',
      toClipId: 'clip-2',
      adjacent: true,
    });
    expect(snapshot.elements?.operations.map((operation) => operation.name)).toContain('elements.create_draft');
    expect(snapshot.tool_access.instructions.join('\n')).toContain('timeline.set_clip_fade');
  });

  it('serializes a clearly delimited machine-readable block', () => {
    const serialized = serializeReighAgentContext(buildReighAgentContextSnapshot({
      tool: 'video-editor',
      projectId: null,
      projectSlug: 'demo',
      timelineId: 'timeline-1',
      timelineName: null,
    }));

    expect(serialized).toMatch(/^<reigh_editor_context>\n/);
    expect(serialized).toContain('"schema": "reigh.editor-context/v1"');
    expect(serialized).toMatch(/<\/reigh_editor_context>$/);
  });
});
