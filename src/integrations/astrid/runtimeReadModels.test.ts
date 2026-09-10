import { describe, expect, it } from 'vitest';

import {
  runtimeGenerationToDetail,
  runtimeGenerationToSummary,
} from './runtimeReadModels';

const outputObject = `sha256:${'d'.repeat(64)}`;

describe('Runtime gallery read models', () => {
  it('keeps the Runtime-owned character animation lineage visible to filtered video galleries', () => {
    const generation = {
      generation_id: 'generation-task-1',
      project_id: 'project-1',
      source_task_id: 'task-1',
      type: 'video',
      status: 'completed',
      metadata: {
        params: {
          tool_type: 'character-animate',
          content_type: 'video',
          prompt: 'walk forward',
        },
      },
      version: 1,
      created_at: '2026-09-10T20:00:00.000Z',
      updated_at: '2026-09-10T20:00:00.000Z',
    };
    const variants = [{
      variant_id: 'initial-variant-1',
      generation_id: generation.generation_id,
      object_id: outputObject,
      variant_type: 'character_animation',
      metadata: {
        is_primary: true,
        source_task_id: 'task-1',
        output_name: 'animated_video',
      },
      created_at: generation.created_at,
    }];

    const detail = runtimeGenerationToDetail(generation, variants);
    const summary = runtimeGenerationToSummary(generation, variants);

    expect(detail.type).toBe('video');
    expect(detail.params).toMatchObject({
      tool_type: 'character-animate',
      content_type: 'video',
    });
    expect(detail.task_id).toBe('task-1');
    expect(detail.variants[0]).toMatchObject({
      variant_type: 'character_animation',
      media_id: outputObject,
      is_primary: true,
    });
    expect(summary).toMatchObject({
      generation_id: generation.generation_id,
      type: 'video',
      params: { tool_type: 'character-animate', content_type: 'video' },
      primary: { media_id: outputObject, variant_type: 'character_animation' },
      variant_count: 1,
    });
  });
});
