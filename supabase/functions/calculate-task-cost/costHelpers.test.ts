import { describe, expect, it } from 'vitest';
import * as CostHelpers from './costHelpers.ts';

describe('calculate-task-cost costHelpers', () => {
  it('imports module directly', () => {
    expect(CostHelpers).toBeDefined();
  });

  it('normalizes known task cost params and preserves unknown fields', () => {
    const parsed = CostHelpers.parseTaskCostParams({
      resolution: '1280x720',
      frame_count: 24,
      model_type: 'base',
      result: { output_frames: 12 },
      passthrough_flag: true,
    });

    expect(parsed).toMatchObject({
      resolution: '1280x720',
      frame_count: 24,
      model_type: 'base',
      result: { output_frames: 12 },
      passthrough_flag: true,
    });
  });

  it('calculates non-video task cost with multipliers and frame factors', () => {
    const result = CostHelpers.calculateTaskCost(
      'image_generation',
      'per_second',
      2,
      0,
      3,
      {
        resolution: { '1280x720': 1.5 },
        frameCount: 0.1,
        modelType: { pro: 2 },
      },
      {
        resolution: '1280x720',
        frame_count: 10,
        model_type: 'pro',
      },
    );

    expect(result).toEqual({ cost: 24 });
  });
});
