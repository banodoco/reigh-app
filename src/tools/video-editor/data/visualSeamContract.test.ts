import { describe, expect, it } from 'vitest';

import type { ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import {
  analyzeVisualSeams,
  assertVisualSeamAdmission,
  VisualSeamAdmissionError,
  withVisualSeamIntent,
} from './visualSeamContract.ts';

function config(clips: ResolvedTimelineConfig['clips'], app?: ResolvedTimelineConfig['app']): ResolvedTimelineConfig {
  return {
    output: { resolution: '1920x1080', fps: 30, file: 'seams.mp4' },
    tracks: [
      { id: 'video', kind: 'visual', label: 'Picture' },
      { id: 'fx', kind: 'visual', label: 'FX' },
    ],
    clips,
    registry: {},
    app,
  };
}

function media(id: string, at: number, hold: number, asset: string, extra: Partial<ResolvedTimelineConfig['clips'][number]> = {}) {
  return { id, at, hold, asset, track: 'video', clipType: 'media', ...extra };
}

describe('visual seam contract', () => {
  it('uses frame ownership rather than float seconds for a contiguous hard cut', () => {
    const report = analyzeVisualSeams(config([
      media('shot-09', 0, 33.8, 'a'),
      media('shot-10', 33.8, 8.1666666667, 'b'),
    ]));

    expect(report.boundaries).toHaveLength(1);
    expect(report.boundaries[0]).toMatchObject({ frame: 1014, timeSeconds: 33.8, unacknowledgedRisk: false });
    expect(report.boundaries[0]?.participants).toEqual(expect.arrayContaining([
      expect.objectContaining({ clipId: 'shot-09', behavior: 'exits' }),
      expect.objectContaining({ clipId: 'shot-10', behavior: 'enters' }),
      expect.objectContaining({ clipId: 'shot-10', behavior: 'source-change' }),
    ]));
  });

  it('uses duration_ms and duration before hold/trim bounds, applying playback speed', () => {
    const durationMsClip = {
      ...media('duration-ms', 0, 1, 'a', { from: 0, to: 10, speed: 2 }),
      duration_ms: 4000,
    };
    const durationClip = {
      ...media('duration-seconds', 0, 1, 'a', { from: 0, to: 10, speed: 3 }),
      duration: 6,
    };

    for (const first of [durationMsClip, durationClip]) {
      const report = analyzeVisualSeams(config([
        first,
        media('next', 2, 1, 'b'),
      ]));

      expect(report.structuralIssues).toEqual([]);
      expect(report.boundaries[0]?.frame).toBe(60);
    }
  });

  it('reports a coincident opaque effect and preserves parent/child ownership and effect identity', () => {
    const report = analyzeVisualSeams(config([
      media('shot-10', 0, 41.9666666667, 'a', {
        app: { canonical: { parentDocumentId: 'timeline', occurrenceId: 'occ-10' } },
      }),
      media('shot-11', 41.9666666667, 4, 'b', {
        app: { canonical: { parentDocumentId: 'timeline', occurrenceId: 'occ-11' } },
      }),
      {
        id: 'fx-process-v3',
        at: 41.9666666667,
        hold: 0.5,
        track: 'fx',
        clipType: 'custom-process',
        elementRef: { id: 'fx-process-v3', kind: 'effect', revision: 'rev-1' },
      },
    ]));

    expect(report.boundaries[0]).toMatchObject({ frame: 1259, unacknowledgedRisk: true });
    expect(report.boundaries[0]?.participants).toEqual(expect.arrayContaining([
      expect.objectContaining({ ownerId: 'occ-11', behavior: 'enters', path: ['parent', 'timeline', 'occurrence', 'occ-11', 'clip', 'shot-11'] }),
      expect.objectContaining({ clipId: 'fx-process-v3', behavior: 'opaque' }),
    ]));
    expect(report.opaqueElements).toContainEqual(expect.objectContaining({
      clipId: 'fx-process-v3',
      clipType: 'custom-process',
      ownerId: 'fx-process-v3',
      startFrame: 1259,
      endFrame: 1274,
      reason: 'custom-clip-type',
      elementRef: { id: 'fx-process-v3', kind: 'effect', revision: 'rev-1' },
    }));
  });

  it('reports opaque effects that began before and remain active across a cut without loading media', () => {
    const source = config([
      media('a', 0, 2, 'a'),
      media('b', 2, 2, 'b'),
      {
        id: 'long-effect',
        at: 0.5,
        hold: 2,
        track: 'fx',
        clipType: 'custom-effect',
        elementRef: { id: 'wipe-v2', kind: 'effect', revision: 'rev-7', packId: 'pack-a' },
      },
    ]);
    const metadataOnly = new Proxy(source, {
      get(target, property, receiver) {
        if (property === 'registry') throw new Error('seam analysis must not access media registry entries');
        return Reflect.get(target, property, receiver);
      },
    });

    const report = analyzeVisualSeams(metadataOnly);
    expect(report.boundaries[0]).toMatchObject({ frame: 60, unacknowledgedRisk: true });
    expect(report.boundaries[0]?.participants).toContainEqual(expect.objectContaining({
      clipId: 'long-effect',
      behavior: 'opaque',
    }));
    expect(report.opaqueElements).toContainEqual(expect.objectContaining({
      clipId: 'long-effect',
      elementRef: { id: 'wipe-v2', kind: 'effect', revision: 'rev-7', packId: 'pack-a' },
      startFrame: 15,
      endFrame: 75,
    }));
  });

  it('does not treat adjacency between effect clips as structural picture continuity', () => {
    const report = analyzeVisualSeams(config([
      media('picture', 0, 3, 'picture'),
      {
        id: 'effect-a', at: 0, hold: 1, track: 'fx', clipType: 'custom-effect',
        elementRef: { id: 'wipe-a', kind: 'effect', revision: 'r1' },
      },
      {
        id: 'effect-b', at: 1 + (1 / 30), hold: 1, track: 'fx', clipType: 'custom-effect',
        elementRef: { id: 'wipe-b', kind: 'effect', revision: 'r1' },
      },
    ]));

    expect(report.structuralIssues).toEqual([]);
    expect(report.opaqueElements).toHaveLength(2);
  });

  it('honors explicit frame intent over implicit transition metadata and synchronized cues', () => {
    const base = config([
      media('a', 0, 2, 'a'),
      media('b', 2, 2, 'b', { transition: { type: 'crossfade', duration: 0.5 } }),
      { id: 'motion', at: 2, hold: 1, track: 'fx', clipType: 'custom-motion', elementRef: { id: 'motion', kind: 'effect', revision: 'r1' } },
    ]);
    expect(analyzeVisualSeams(base).boundaries[0]).toMatchObject({ intent: 'transition', requiresIntent: false, unacknowledgedRisk: true });
    const synchronized = withVisualSeamIntent(base, 60, 'synchronized');
    expect(analyzeVisualSeams(synchronized).boundaries[0]).toMatchObject({ intent: 'synchronized', requiresIntent: false, unacknowledgedRisk: true });
    const explicitHardCut = withVisualSeamIntent(base, 60, 'hard-cut');
    expect(analyzeVisualSeams(explicitHardCut).boundaries[0]).toMatchObject({ intent: 'hard-cut', requiresIntent: true, unacknowledgedRisk: true });
    expect(() => assertVisualSeamAdmission(explicitHardCut, { enforceIntent: true })).toThrow(VisualSeamAdmissionError);
  });

  it('rejects structural gaps/overlaps and leaves media out of the analysis', () => {
    const report = analyzeVisualSeams(config([
      media('a', 0, 1, 'a'),
      media('b', 1 + (1 / 30), 1, 'b'),
      { id: 'overlay', at: 0, hold: 3, track: 'fx', clipType: 'effect-layer' },
    ]));
    expect(report.structuralIssues).toHaveLength(1);
    expect(() => assertVisualSeamAdmission(config([
      media('a', 0, 1, 'a'),
      media('b', 1 + (1 / 30), 1, 'b'),
    ]))).toThrow(VisualSeamAdmissionError);
  });

  it('requires explicit intent only when admission enforcement is requested', () => {
    const unsafe = config([
      media('a', 0, 2, 'a'),
      media('b', 2, 2, 'b'),
      { id: 'motion', at: 2, hold: 1, track: 'fx', clipType: 'custom-motion', elementRef: { id: 'motion', kind: 'effect', revision: 'r1' } },
    ]);
    expect(analyzeVisualSeams(unsafe).boundaries[0]?.intent).toBeUndefined();
    expect(analyzeVisualSeams(unsafe).boundaries[0]?.unacknowledgedRisk).toBe(true);
    expect(() => assertVisualSeamAdmission(unsafe, { enforceIntent: true })).toThrow(VisualSeamAdmissionError);
    const acknowledged = withVisualSeamIntent(unsafe, 60, 'synchronized');
    expect(() => assertVisualSeamAdmission(acknowledged, { enforceIntent: true })).not.toThrow();
    expect(analyzeVisualSeams(acknowledged).boundaries[0]).toMatchObject({ intent: 'synchronized', requiresIntent: false, unacknowledgedRisk: true });
  });

  it('binds stored intent to the current boundary participants and leaves a second boundary untouched', () => {
    const original = config([
      media('a', 0, 2, 'a'),
      media('b', 2, 2, 'b'),
      { id: 'motion-a', at: 2, hold: 0.5, track: 'fx', clipType: 'custom-motion', elementRef: { id: 'motion-a', kind: 'effect', revision: 'r1' } },
      media('c', 4, 2, 'c'),
      { id: 'motion-b', at: 4, hold: 0.5, track: 'fx', clipType: 'custom-motion', elementRef: { id: 'motion-b', kind: 'effect', revision: 'r1' } },
    ]);
    const acknowledged = withVisualSeamIntent(original, 60, 'synchronized');
    const report = analyzeVisualSeams(acknowledged);
    expect(report.boundaries.find((boundary) => boundary.frame === 60)?.requiresIntent).toBe(false);
    expect(report.boundaries.find((boundary) => boundary.frame === 120)?.requiresIntent).toBe(true);
    const edited = {
      ...acknowledged,
      clips: acknowledged.clips.map((clip) => clip.id === 'motion-a' ? { ...clip, id: 'motion-a-edited' } : clip),
    };
    expect(analyzeVisualSeams(edited).boundaries.find((boundary) => boundary.frame === 60)?.requiresIntent).toBe(true);
  });

  it('stays metadata-only for a large synthetic seam matrix', () => {
    const clips = Array.from({ length: 500 }, (_, index) => media(
      `clip-${index}`,
      index * 1.0,
      1,
      `asset-${index}`,
    ));
    const metadataOnly = new Proxy(config(clips), {
      get(target, property, receiver) {
        if (property === 'registry') throw new Error('seam analysis must not access media registry entries');
        return Reflect.get(target, property, receiver);
      },
    });
    analyzeVisualSeams(metadataOnly);
    const samples = Array.from({ length: 3 }, () => {
      const started = performance.now();
      const report = analyzeVisualSeams(metadataOnly);
      return { elapsedMs: performance.now() - started, report };
    });
    const { elapsedMs, report } = samples[0]!;
    expect(report.boundaries).toHaveLength(499);
    expect(Math.max(...samples.map((sample) => sample.elapsedMs))).toBeLessThan(100);
    expect(elapsedMs).toBeLessThan(100);
  });
});
