import { describe, expect, it } from 'vitest';
import {
  buildReighAgentElementContext,
  pinElementRevision,
  validateReighElementOperation,
} from './element-contract.ts';

describe('Astrid-backed element contract', () => {
  it('builds one compact catalog while retaining legacy sequence resources separately', () => {
    const context = buildReighAgentElementContext({
      effects: [{
        id: 'glow',
        name: 'Glow',
        code: 'function Glow() { return null; }',
        is_public: false,
      }],
      sequences: [{
        id: 'sequence-1',
        clipType: 'custom:sequence-1',
        name: 'Legacy Sequence',
        code: 'export default function Sequence() { return null; }',
        schemaJson: {},
        defaultsJson: {},
      }],
      astridTransitions: [
        { transitionId: 'cross-fade', provenance: 'astrid-catalog' },
        { transitionId: 'fade', provenance: 'astrid-catalog' },
      ],
      transitions: [{
        transitionId: 'wipe',
        provenance: 'built-in',
        renderability: {
          defaultRoute: 'preview',
          determinism: 'preview-only',
          capabilities: [
            { route: 'preview', status: 'supported', determinism: 'preview-only' },
            { route: 'browser-export', status: 'blocked', determinism: 'preview-only' },
          ],
        },
      }],
      clips: [
        { id: 'a', trackId: 'picture', at: 0, duration: 2 },
        { id: 'b', trackId: 'picture', at: 2, duration: 3 },
      ],
    });

    expect(context.catalog.map((entry) => entry.id)).toEqual(['glow', 'cross-fade', 'fade', 'wipe']);
    expect(context.catalog.find((entry) => entry.id === 'wipe')?.capabilities).toMatchObject({
      browserPreview: 'supported',
      astridExport: 'blocked',
    });
    expect(context.legacySequenceResources[0]).toMatchObject({
      clipType: 'custom:sequence-1',
      label: 'Legacy Sequence',
    });
    expect(context.transitionCandidates).toEqual([expect.objectContaining({
      fromClipId: 'a',
      toClipId: 'b',
      adjacent: true,
    })]);
    expect(context.operations.some((operation) => operation.name === 'timeline.set_clip_fade')).toBe(true);
  });

  it('requires a positive CAS version for timeline mutations', () => {
    const diagnostics = validateReighElementOperation({
      name: 'timeline.set_clip_fade',
      project: 'astrid-intro',
      timeline: 'main',
      expected_version: 0,
      clip_id: 'clip-1',
      fade_in: 0.5,
    });

    expect(diagnostics).toEqual([
      { path: 'expected_version', message: 'must be a positive integer CAS version' },
    ]);
  });

  it('projects Astrid effects and animations into the shared agent catalog', () => {
    const context = buildReighAgentElementContext({
      astridEffects: [{
        id: 'frame-overlay',
        name: 'Frame Overlay',
        description: 'Astrid effect',
        revision: 'sha256:effect',
        defaults: { opacity: 1 },
        provenance: 'astrid-catalog',
        renderability: {
          defaultRoute: 'preview',
          determinism: 'deterministic',
          capabilities: [
            { route: 'preview', status: 'supported', determinism: 'deterministic' },
            { route: 'browser-export', status: 'supported', determinism: 'deterministic' },
            { route: 'worker-export', status: 'supported', determinism: 'deterministic' },
          ],
        },
      }],
      astridAnimations: [{
        id: 'fade-up',
        name: 'Fade Up',
        revision: 'sha256:animation',
        provenance: 'astrid-catalog',
      }],
    });

    expect(context.catalog).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'frame-overlay', kind: 'effect', revision: 'sha256:effect', publication: 'published' }),
      expect.objectContaining({ id: 'fade-up', kind: 'animation', revision: 'sha256:animation', publication: 'published' }),
    ]));
  });

  it('rejects unsafe draft source and malformed transition placement', () => {
    const diagnostics = validateReighElementOperation({
      name: 'elements.create_draft',
      id: 'draft-1',
      kind: 'effect',
      label: 'Draft',
      source: 'import React from "react"; export default function Draft() { return null; }',
    });
    expect(diagnostics.some((diagnostic) => diagnostic.path === 'source')).toBe(true);

    const transitionDiagnostics = validateReighElementOperation({
      name: 'timeline.apply_transition',
      project: 'astrid-intro',
      timeline: 'main',
      expected_version: 4,
      from_clip: 'a',
      to_clip: 'b',
      transition: { id: 'cross-fade', kind: 'bogus', revision: 'rev-1' },
    });
    expect(transitionDiagnostics).toContainEqual({
      path: 'transition.kind',
      message: 'must be effect, animation, or transition',
    });
  });

  it('pins an element revision without changing unrelated clips', () => {
    const config = {
      output: { resolution: '1280x720', fps: 30, file: 'out.mp4' },
      clips: [
        { id: 'clip-1', at: 0, track: 'picture' },
        { id: 'clip-2', at: 1, track: 'picture' },
      ],
    };
    const next = pinElementRevision(config, 'clip-1', {
      id: 'glow',
      kind: 'effect',
      revision: 'rev-1',
    });

    expect(next.clips[0].elementRef).toEqual({ id: 'glow', kind: 'effect', revision: 'rev-1' });
    expect(next.clips[1]).toEqual(config.clips[1]);
  });
});
