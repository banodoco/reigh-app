import { describe, expect, it } from 'vitest';
import * as ParamsGeneration from './paramsGeneration.ts';

describe('complete_task paramsGeneration', () => {
  it('imports module directly', () => {
    expect(ParamsGeneration).toBeDefined();
  });

  it('builds generation params with tool metadata', () => {
    const params = ParamsGeneration.buildGenerationParams(
      { seed: 1234, image: 'https://cdn.example.com/source.png' },
      'video_travel',
      'video',
      'shot-1',
      'https://cdn.example.com/thumb.png',
      'task-1',
    ) as Record<string, unknown>;

    expect(params).toMatchObject({
      seed: 1234,
      image: 'https://cdn.example.com/source.png',
      tool_type: 'video_travel',
      content_type: 'video',
      shotId: 'shot-1',
      thumbnailUrl: 'https://cdn.example.com/thumb.png',
      source_task_id: 'task-1',
    });
  });
});
