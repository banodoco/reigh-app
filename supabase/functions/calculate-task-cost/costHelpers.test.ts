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

  it('drops invalid video enhance metric fields instead of casting them through', () => {
    const parsed = CostHelpers.parseTaskCostParams({
      result: {
        output_frames: 12,
        output_width: '1920',
        interpolation_compute_seconds: 4,
      },
    });

    expect(parsed.result).toEqual({
      output_frames: 12,
      interpolation_compute_seconds: 4,
    });
    expect(parsed.result).not.toHaveProperty('output_width');
  });

  it('rejects invalid cost factor fields during task payload parsing', () => {
    const parsed = CostHelpers.parseTaskWithProject({
      id: 'task-1',
      task_type: 'image_generation',
      params: {},
      status: 'complete',
      generation_started_at: '2026-01-01T00:00:00.000Z',
      generation_processed_at: '2026-01-01T00:00:05.000Z',
      project_id: 'project-1',
      projects: { user_id: 'user-1' },
      task_types: {
        id: 'image_generation',
        billing_type: 'per_second',
        base_cost_per_second: 2,
        unit_cost: 0,
        cost_factors: {
          resolution: { '1280x720': 1.5, broken: 'x' },
          frameCount: 'bad',
          modelType: { pro: 2, bad: false },
        },
        is_active: true,
      },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error('Expected parsed task to be valid');
    }
    expect(parsed.task.task_type_config?.cost_factors).toEqual({
      resolution: { '1280x720': 1.5 },
      modelType: { pro: 2 },
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

  it('calculates video enhance cost from validated metrics only', () => {
    const result = CostHelpers.calculateTaskCost(
      'video_enhance',
      'per_second',
      0,
      0,
      0,
      null,
      {
        result: {
          interpolation_compute_seconds: 10,
          output_width: 1920,
          output_height: 1080,
          output_frames: 24,
        },
      },
    );

    expect(result).toEqual({
      cost: 0.037883,
      breakdown: {
        interpolation: {
          compute_seconds: 10,
          cost_per_second: 0.0013,
          cost: 0.013,
        },
        upscale: {
          output_width: 1920,
          output_height: 1080,
          output_frames: 24,
          megapixels: 49.77,
          cost_per_megapixel: 0.0005,
          cost: 0.024883,
        },
      },
    });
  });
});
