import { describe, expect, it } from 'vitest';
import { resolvePrimaryStructureVideo } from '../primaryStructureVideo';

describe('resolvePrimaryStructureVideo', () => {
  it('derives controls from canonical structure_guidance when provided', () => {
    const result = resolvePrimaryStructureVideo(
      [{
        path: '/videos/guide.mp4',
        start_frame: 0,
        end_frame: 100,
        treatment: 'clip',
        metadata: null,
      }],
      {
        target: 'uni3c',
        strength: 1.6,
        step_window: [0.2, 0.75],
      },
    );

    expect(result).toEqual({
      path: '/videos/guide.mp4',
      metadata: null,
      treatment: 'clip',
      motionStrength: 1.6,
      structureType: 'uni3c',
      uni3cEndPercent: 0.75,
    });
  });

  it('falls back to canonical defaults when guidance is absent', () => {
    const result = resolvePrimaryStructureVideo([{
      path: '/videos/defaults.mp4',
      start_frame: 0,
      end_frame: 100,
      treatment: 'adjust',
      metadata: null,
    }]);

    expect(result.motionStrength).toBe(1.2);
    expect(result.structureType).toBe('uni3c');
    expect(result.uni3cEndPercent).toBe(0.1);
  });
});
