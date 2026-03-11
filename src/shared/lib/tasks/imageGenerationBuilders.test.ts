import { describe, expect, it } from 'vitest';
import {
  buildHiresOverride,
  buildImageGenerationBaseParams,
  buildLorasParam,
  buildReferenceParams,
} from './imageGenerationBuilders';

describe('imageGenerationBuilders', () => {
  it('builds additional lora params and merges in-scene loras', () => {
    expect(
      buildLorasParam(
        [
          { path: 'base-a.safetensors', strength: 0.4 },
          { path: 'base-b.safetensors', strength: 0.6 },
        ] as never,
        { url: 'scene.safetensors', strength: 0.8 },
      ),
    ).toEqual({
      additional_loras: {
        'base-a.safetensors': 0.4,
        'base-b.safetensors': 0.6,
        'scene.safetensors': 0.8,
      },
    });
  });

  it('filters reference params by mode and falls back to the style reference image', () => {
    expect(
      buildReferenceParams('style.png', 'subject', {
        styleReferenceStrength: 0.7,
        subjectStrength: 0.9,
        subjectDescription: 'hero character',
        inThisScene: true,
        inThisSceneStrength: 0.5,
        subjectReferenceImage: undefined,
      } as never),
    ).toEqual({
      style_reference_image: 'style.png',
      subject_reference_image: 'style.png',
      style_reference_strength: 1.1,
      subject_strength: 0.5,
      subject_description: 'hero character',
    });

    expect(buildReferenceParams(undefined, 'style', {} as never)).toEqual({});
  });

  it('builds hires overrides and image-generation base params with defaults', () => {
    expect(
      buildHiresOverride(1.5, 0.4, 9, { 'extra.safetensors': 0.7 }, { 'base.safetensors': 0.5 }),
    ).toEqual({
      hires_scale: 1.5,
      hires_steps: 9,
      hires_denoise: 0.4,
      additional_loras: {
        'base.safetensors': 0.5,
        'extra.safetensors': 0.7,
      },
    });

    expect(
      buildImageGenerationBaseParams(
        {
          prompt: 'Generate a portrait',
          negative_prompt: 'blurry',
          model_name: undefined,
          seed: undefined,
          steps: undefined,
        } as never,
        'task-1',
        '1024x1024',
      ),
    ).toEqual({
      task_id: 'task-1',
      model: 'optimised-t2i',
      prompt: 'Generate a portrait',
      resolution: '1024x1024',
      seed: 11111,
      steps: 12,
      add_in_position: false,
      negative_prompt: 'blurry',
    });
  });
});
