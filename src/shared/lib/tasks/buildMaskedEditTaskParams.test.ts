import { describe, expect, it } from 'vitest';
import { buildMaskedEditTaskParams } from './buildMaskedEditTaskParams';

describe('buildMaskedEditTaskParams', () => {
  it('maps internal names to masked-edit API params', () => {
    const params = buildMaskedEditTaskParams({
      projectId: 'project-1',
      imageUrl: 'https://example.com/image.png',
      maskUrl: 'https://example.com/mask.png',
      prompt: 'fill edges',
      numGenerations: 2,
      generationId: 'gen-1',
      shotId: 'shot-1',
      toolType: 'reposition',
      sourceVariantId: 'variant-1',
      qwenEditModel: 'qwen',
    });

    expect(params).toMatchObject({
      project_id: 'project-1',
      image_url: 'https://example.com/image.png',
      mask_url: 'https://example.com/mask.png',
      prompt: 'fill edges',
      num_generations: 2,
      generation_id: 'gen-1',
      shot_id: 'shot-1',
      tool_type: 'reposition',
      source_variant_id: 'variant-1',
      qwen_edit_model: 'qwen',
    });
  });
});
