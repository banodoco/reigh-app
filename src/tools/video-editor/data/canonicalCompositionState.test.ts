import { describe, expect, it } from 'vitest';
import fixture from './shotComposition.fixture.json';
import { createShotCompositionAdapter } from './shotCompositionAdapter.ts';
import { resolveCanonicalComposition } from './canonicalCompositionState.ts';

const composition = createShotCompositionAdapter({ load: async () => fixture }).prepare(fixture);
const baseConfig = {
  output: { resolution: '1280x720', fps: 24, file: 'timeline.mp4' },
  tracks: [{ id: 'video', kind: 'visual' as const, label: 'Video' }],
  clips: [{ id: 'shot-shell', at: 0, track: 'video', clipType: 'shot', hold: 2 }],
  registry: {},
};

describe('canonical composition readiness', () => {
  it('waits for the canonical graph instead of exposing legacy shot shells', () => {
    const result = resolveCanonicalComposition({
      userId: null,
      hasShotClips: true,
      hasShotComposition: true,
      composition: null,
      compositionError: null,
      baseConfig,
    });

    expect(result).toMatchObject({ source: 'canonical', status: 'loading', config: null, error: null });
  });

  it('keeps ordinary timelines on their legacy config', () => {
    const result = resolveCanonicalComposition({
      userId: null,
      hasShotClips: false,
      hasShotComposition: true,
      composition: null,
      compositionError: null,
      baseConfig,
    });

    expect(result).toMatchObject({ source: 'legacy', status: 'ready', config: baseConfig, error: null });
  });

  it('projects the prepared graph for both preview and export consumers', () => {
    const result = resolveCanonicalComposition({
      userId: null,
      hasShotClips: true,
      hasShotComposition: true,
      composition,
      compositionError: null,
      baseConfig,
    });

    expect(result.source).toBe('canonical');
    expect(result.status).toBe('ready');
    expect(result.config?.clips.some((clip) => clip.clipType === 'shot')).toBe(false);
  });

  it('fails closed with a canonical error instead of reviving the legacy graph', () => {
    const error = new Error('canonical graph unavailable');
    const result = resolveCanonicalComposition({
      userId: null,
      hasShotClips: true,
      hasShotComposition: true,
      composition: null,
      compositionError: error,
      baseConfig,
    });

    expect(result).toMatchObject({ source: 'canonical', status: 'error', config: null, error });
  });
});
