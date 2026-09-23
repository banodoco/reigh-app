import { describe, expect, it, vi } from 'vitest';
import { AstridElementOperationAdapter } from './element-adapter.ts';
import { buildReighAgentElementContext } from './element-contract.ts';

function context() {
  return buildReighAgentElementContext({
    astridTransitions: [{ transitionId: 'cross-fade', provenance: 'astrid-catalog' }],
    effects: [{ id: 'glow', name: 'Glow', is_public: true }],
    clips: [
      { id: 'a', trackId: 'picture', at: 0, duration: 2 },
      { id: 'b', trackId: 'picture', at: 2, duration: 2 },
    ],
  });
}

function documentPayload() {
  return {
    config: {
      output: { resolution: '1280x720', fps: 30, file: 'out.mp4' },
      clips: [
        { id: 'a', at: 0, track: 'picture', hold: 2 },
        { id: 'b', at: 2, track: 'picture', hold: 2 },
      ],
    },
    registry: {},
    config_version: 7,
  };
}

describe('Astrid element operation adapter', () => {
  it('applies a pinned transition through one expected-version CAS save', async () => {
    const payload = documentPayload();
    const save = vi.fn(async (_ref, input) => ({
      ...payload,
      config: input.config,
      registry: input.registry,
      config_version: 8,
    }));
    const adapter = new AstridElementOperationAdapter(context(), {
      get: vi.fn(async () => payload),
      save,
    }, 'astrid-intro');

    const result = await adapter.execute({
      name: 'timeline.apply_transition',
      project: 'astrid-intro',
      timeline: 'main',
      expected_version: 7,
      from_clip: 'a',
      to_clip: 'b',
      transition: {
        id: 'cross-fade',
        kind: 'transition',
        revision: context().catalog.find((entry) => entry.id === 'cross-fade')?.revision,
      },
    });

    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0]?.[1].expectedVersion).toBe(7);
    expect(result.config?.clips[1].elementRef?.id).toBe('cross-fade');
    expect(result.config?.clips[1].transition).toMatchObject({ type: 'cross-fade', duration: 8 / 30 });
  });

  it('rejects an operation against a stale loaded document before writing', async () => {
    const payload = documentPayload();
    const save = vi.fn();
    const adapter = new AstridElementOperationAdapter(context(), {
      get: vi.fn(async () => ({ ...payload, config_version: 8 })),
      save,
    }, 'astrid-intro');

    await expect(adapter.execute({
      name: 'timeline.set_clip_fade',
      project: 'astrid-intro',
      timeline: 'main',
      expected_version: 7,
      clip_id: 'a',
      fade_in: 0.5,
    })).rejects.toThrow('Stale timeline version');
    expect(save).not.toHaveBeenCalled();
  });

  it('keeps a validated draft previewable by pinning its source in the element registry', async () => {
    const payload = documentPayload();
    const save = vi.fn(async (_ref, input) => ({
      ...payload,
      config: input.config,
      registry: input.registry,
      config_version: 8,
    }));
    const adapter = new AstridElementOperationAdapter(context(), {
      get: vi.fn(async () => payload),
      save,
    }, 'astrid-intro');
    const source = 'export default function Draft({ clip }) { return <div data-testid="draft-preview">{clip.id}</div>; }';

    const draft = await adapter.execute({
      name: 'elements.create_draft',
      id: 'draft-glow',
      kind: 'effect',
      label: 'Draft glow',
      source,
    });
    const revision = draft.draft?.revision ?? '';
    expect(revision).toBeTruthy();

    const validation = await adapter.execute({
      name: 'elements.validate',
      draft_id: 'draft-glow',
      target: ['browser_preview'],
    });
    expect(validation.validation?.valid).toBe(true);
    expect(validation.draft?.capabilities.browserPreview).toBe('supported');

    const applied = await adapter.execute({
      name: 'timeline.apply_element',
      project: 'astrid-intro',
      timeline: 'main',
      expected_version: 7,
      clip_id: 'a',
      placement: 'overlay',
      element: { id: 'draft-glow', kind: 'effect', revision },
    });

    const appliedClip = applied.config?.clips.find((clip) => clip.elementRef?.id === 'draft-glow');
    expect(appliedClip?.generation?.sequence_lane).toBeUndefined();
    expect(appliedClip?.elementRef).toEqual({
      id: 'draft-glow',
      kind: 'effect',
      revision,
    });
    expect(applied.config?.app?.elements).toMatchObject({
      'draft-glow': { kind: 'effect', revision, source },
    });
  });

  it('rejects a draft before validation when its Remotion source is broken', async () => {
    const adapter = new AstridElementOperationAdapter(context(), {
      get: vi.fn(async () => documentPayload()),
      save: vi.fn(),
    }, 'astrid-intro');
    await adapter.execute({
      name: 'elements.create_draft',
      id: 'broken-glow',
      kind: 'effect',
      label: 'Broken glow',
      source: 'export default function Broken(',
    });
    const validation = await adapter.execute({ name: 'elements.validate', draft_id: 'broken-glow' });
    expect(validation.validation?.valid).toBe(false);
    await expect(adapter.execute({
      name: 'timeline.apply_element',
      project: 'astrid-intro',
      timeline: 'main',
      expected_version: 7,
      clip_id: 'a',
      placement: 'overlay',
      element: { id: 'broken-glow', kind: 'effect', revision: 'draft-broken-glow' },
    })).rejects.toThrow('must pass elements.validate');
  });

  it('creates a deterministic overlay clip when placement is overlay', async () => {
    const payload = documentPayload();
    const save = vi.fn(async (_ref, input) => ({
      ...payload,
      config: input.config,
      registry: input.registry,
      config_version: 8,
    }));
    const adapter = new AstridElementOperationAdapter(context(), { get: vi.fn(async () => payload), save }, 'astrid-intro');
    const element = context().catalog.find((entry) => entry.id === 'glow');
    const result = await adapter.execute({
      name: 'timeline.apply_element',
      project: 'astrid-intro',
      timeline: 'main',
      expected_version: 7,
      clip_id: 'a',
      at: 0.5,
      duration: 1.25,
      placement: 'overlay',
      element: { id: 'glow', kind: 'effect', revision: element?.revision },
    });
    expect(result.config?.clips).toContainEqual(expect.objectContaining({
      id: 'element-glow-500',
      at: 0.5,
      clipType: 'glow',
      hold: 1.25,
      elementRef: { id: 'glow', kind: 'effect', revision: element?.revision },
    }));
  });

  it('projects an animation application into the backend animation reference field', async () => {
    const payload = documentPayload();
    const save = vi.fn(async (_ref, input) => ({
      ...payload,
      config: input.config,
      registry: input.registry,
      config_version: 8,
    }));
    const animationContext = buildReighAgentElementContext({
      effects: [{ id: 'glow', name: 'Glow', is_public: true }],
      astridTransitions: [{ transitionId: 'cross-fade', provenance: 'astrid-catalog' }],
      astridAnimations: [{ id: 'fade-up', name: 'Fade Up', revision: 'rev-animation', provenance: 'astrid-catalog' }],
      clips: [
        { id: 'a', trackId: 'picture', at: 0, duration: 2 },
        { id: 'b', trackId: 'picture', at: 2, duration: 2 },
      ],
    });
    const adapter = new AstridElementOperationAdapter(animationContext, { get: vi.fn(async () => payload), save }, 'astrid-intro');
    const result = await adapter.execute({
      name: 'timeline.apply_element',
      project: 'astrid-intro',
      timeline: 'main',
      expected_version: 7,
      clip_id: 'a',
      placement: 'clip',
      element: { id: 'fade-up', kind: 'animation', revision: 'rev-animation' },
    });

    expect(result.config?.clips[0]).toMatchObject({
      elementRef: { id: 'fade-up', kind: 'animation', revision: 'rev-animation' },
      entrance: { type: 'fade-up', duration: 0.4 },
    });
  });

  it('rejects an explicit non-adjacent transition target', async () => {
    const payload = documentPayload();
    const adapter = new AstridElementOperationAdapter(context(), {
      get: vi.fn(async () => payload),
      save: vi.fn(),
    }, 'astrid-intro');
    await expect(adapter.execute({
      name: 'timeline.apply_transition',
      project: 'astrid-intro',
      timeline: 'main',
      expected_version: 7,
      from_clip: 'a',
      to_clip: 'a',
      transition: {
        id: 'cross-fade',
        kind: 'transition',
        revision: context().catalog.find((entry) => entry.id === 'cross-fade')?.revision,
      },
    })).rejects.toThrow('Transitions require adjacent clips');
  });
});
