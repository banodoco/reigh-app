import { describe, expect, it } from 'vitest';

import type { ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import { analyzeVisualSeams } from './visualSeamContract.ts';

function makeConfig(clips: ResolvedTimelineConfig['clips'], fps = 24): ResolvedTimelineConfig {
  return {
    output: { resolution: '1920x1080', fps, file: 'acceptance.mp4' },
    tracks: [
      { id: 'picture', kind: 'visual', label: 'Picture' },
      { id: 'fx', kind: 'visual', label: 'Effects' },
    ],
    clips,
    registry: {},
  };
}

describe('visual seam generic acceptance matrix', () => {
  it('covers fractional non-30fps timing, hold precedence, speed, delayed motion and parent ownership', () => {
    const config = makeConfig([
      { id: 'first', at: 0, hold: 1.25, from: 0, to: 9, speed: 1.25, asset: 'a', track: 'picture', clipType: 'media' },
      { id: 'second', at: 1.25, hold: 0.5, asset: 'b', track: 'picture', clipType: 'media' },
      { id: 'third', at: 1.75, hold: 1, asset: 'c', track: 'picture', clipType: 'media' },
      {
        id: 'parent-motion', at: 1.25, hold: 1, track: 'fx', clipType: 'effect-layer',
        app: { canonical: { parentDocumentId: 'parent', occurrenceId: 'parent-fx' } },
        keyframes: { x: [{ time: 0, value: 0, interpolation: 'linear' }, { time: 0.5, value: 20, interpolation: 'linear' }] },
      },
      {
        id: 'constant-transform', at: 1.25, hold: 1, track: 'fx', clipType: 'effect-layer',
        keyframes: { x: [{ time: 0, value: 8, interpolation: 'linear' }, { time: 0.5, value: 8, interpolation: 'linear' }] },
      },
    ]);
    const report = analyzeVisualSeams(config);
    expect(report.fps).toBe(24);
    expect(report.boundaries[0]?.frame).toBe(30);
    expect(report.boundaries.find((boundary) => boundary.frame === 42)?.participants).toContainEqual(expect.objectContaining({
      clipId: 'parent-motion', ownerId: 'parent-fx', behavior: 'motion-start',
      path: ['parent', 'parent', 'occurrence', 'parent-fx', 'clip', 'parent-motion'],
    }));
    expect(report.boundaries.flatMap((boundary) => boundary.participants).filter((item) => item.clipId === 'constant-transform' && item.behavior === 'motion-start')).toHaveLength(0);
  });

  it('allows explicit pauses and valid transition overlaps while flagging undeclared gaps and overlaps', () => {
    const report = analyzeVisualSeams(makeConfig([
      { id: 'pause-a', at: 0, hold: 1, asset: 'a', track: 'picture', clipType: 'media' },
      { id: 'pause-b', at: 2, hold: 1, asset: 'b', track: 'picture', clipType: 'media', app: { visualBoundary: { intentionalPause: true } } },
      { id: 'overlap-a', at: 4, hold: 1, asset: 'c', track: 'picture', clipType: 'media' },
      { id: 'overlap-b', at: 4.5, hold: 1, asset: 'd', track: 'picture', clipType: 'media', transition: { type: 'crossfade', duration: 0.5 } },
    ]));
    expect(report.structuralIssues).toEqual([]);
    const undeclared = analyzeVisualSeams(makeConfig([
      { id: 'gap-a', at: 0, hold: 1, asset: 'a', track: 'picture', clipType: 'media' },
      { id: 'gap-b', at: 2, hold: 1, asset: 'b', track: 'picture', clipType: 'media' },
    ]));
    expect(undeclared.structuralIssues).toHaveLength(1);
  });
});
