import { describe, expect, it } from 'vitest';

import type { ResolvedTimelineConfig } from '@/tools/video-editor/types/index.ts';
import { analyzeVisualSeams } from './visualSeamContract.ts';

describe('visual seam metadata performance', () => {
  it('keeps warm full analysis under an 8ms p95 for 500 clips and 100 parent effects', () => {
    const clips: ResolvedTimelineConfig['clips'] = Array.from({ length: 500 }, (_, index) => ({
      id: `picture-${index}`, at: index * 2, hold: 2, asset: `asset-${index}`, track: 'picture', clipType: 'media',
    }));
    for (let index = 0; index < 100; index += 1) {
      clips.push({
        id: `parent-fx-${index}`, at: index * 9.5, hold: 3, track: 'fx', clipType: 'custom-effect',
        elementRef: { id: `effect-${index}`, kind: 'effect', revision: 'fixture-v1' },
      });
    }
    const source: ResolvedTimelineConfig = {
      output: { resolution: '1920x1080', fps: 24, file: 'performance.mp4' },
      tracks: [
        { id: 'picture', kind: 'visual', label: 'Picture' },
        { id: 'fx', kind: 'visual', label: 'Effects' },
      ],
      clips,
      registry: {},
    };
    const metadataOnly = new Proxy(source, {
      get(target, property, receiver) {
        if (property === 'registry') throw new Error('metadata analysis accessed media registry');
        return Reflect.get(target, property, receiver);
      },
    });
    for (let index = 0; index < 5; index += 1) analyzeVisualSeams(metadataOnly);
    const samples = Array.from({ length: 25 }, () => {
      const start = performance.now();
      const report = analyzeVisualSeams(metadataOnly);
      return { ms: performance.now() - start, report };
    });
    const sorted = samples.map((sample) => sample.ms).sort((left, right) => left - right);
    const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1]!;
    expect(samples.at(-1)?.report.opaqueElements).toHaveLength(100);
    expect(p95).toBeLessThan(8);
  });
});
