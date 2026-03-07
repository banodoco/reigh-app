import { describe, expect, it } from 'vitest';
import { buildBatchTaskParams } from '../../lib/buildBatchTaskParams';
import { toShortPrompt } from '../../lib/promptUtils';
import { DEFAULT_HIRES_FIX_CONFIG } from '../../types';

describe('buildBatchTaskParams', () => {
  it('uses the shared short-prompt policy when shortPrompt is empty', () => {
    const fullPrompt = 'A deliberately long prompt that should be truncated by one shared rule';
    const result = buildBatchTaskParams({
      projectId: 'project-1',
      prompts: [{ id: 'prompt-1', fullPrompt, shortPrompt: '' }],
      imagesPerPrompt: 1,
      shotId: null,
      beforePromptText: 'Before',
      afterPromptText: 'After',
      styleBoostTerms: 'Boost',
      isLocalGenerationEnabled: false,
      hiresFixConfig: DEFAULT_HIRES_FIX_CONFIG,
      modelName: 'qwen-image',
      referenceParams: {},
    });

    const combinedFullPrompt = `Before, ${fullPrompt.trim()}, After, Boost`;
    expect(result.prompts[0].shortPrompt).toBe(toShortPrompt(combinedFullPrompt));
  });

  it('passes through explicit subject reference image without rewriting it', () => {
    const result = buildBatchTaskParams({
      projectId: 'project-1',
      prompts: [{ id: 'prompt-1', fullPrompt: 'Prompt', shortPrompt: 'Prompt' }],
      imagesPerPrompt: 1,
      shotId: null,
      beforePromptText: '',
      afterPromptText: '',
      styleBoostTerms: '',
      isLocalGenerationEnabled: false,
      hiresFixConfig: DEFAULT_HIRES_FIX_CONFIG,
      modelName: 'qwen-image',
      referenceParams: {
        style_reference_image: 'https://example.com/style.png',
        subject_reference_image: 'https://example.com/subject.png',
        reference_mode: 'custom',
      },
    });

    expect(result.style_reference_image).toBe('https://example.com/style.png');
    expect(result.subject_reference_image).toBe('https://example.com/subject.png');
  });

  it('keeps explicit reference fields even when style_reference_image is omitted', () => {
    const result = buildBatchTaskParams({
      projectId: 'project-1',
      prompts: [{ id: 'prompt-1', fullPrompt: 'Prompt', shortPrompt: 'Prompt' }],
      imagesPerPrompt: 1,
      shotId: null,
      beforePromptText: '',
      afterPromptText: '',
      styleBoostTerms: '',
      isLocalGenerationEnabled: false,
      hiresFixConfig: DEFAULT_HIRES_FIX_CONFIG,
      modelName: 'qwen-image',
      referenceParams: {
        subject_reference_image: 'https://example.com/subject.png',
        subject_description: 'hero subject',
        in_this_scene: false,
      },
    });

    expect(result.style_reference_image).toBeUndefined();
    expect(result.subject_reference_image).toBe('https://example.com/subject.png');
    expect(result.subject_description).toBe('hero subject');
    expect(result.in_this_scene).toBe(false);
  });
});
