import { describe, it, expect } from 'vitest';
import {
  BY_REFERENCE_LORA_TYPE,
  TEXT_TO_IMAGE_MODELS,
  getLoraCategoryForModel,
  getLoraTypeForModel,
} from './types';

describe('ImageGenerationForm types helpers', () => {
  it('exposes expected text-to-image model options', () => {
    const modelIds = TEXT_TO_IMAGE_MODELS.map((model) => model.id);

    expect(modelIds).toContain('qwen-image');
    expect(modelIds).toContain('qwen-image-2512');
    expect(modelIds).toContain('z-image');
  });

  it('resolves LoRA type by model with a stable fallback', () => {
    expect(getLoraTypeForModel('qwen-image')).toBe('Qwen Image');
    expect(getLoraTypeForModel('qwen-image-2512')).toBe('Qwen Image 2512');
    expect(getLoraTypeForModel('z-image')).toBe('Z-Image');
    expect(getLoraTypeForModel('invalid-model' as never)).toBe(BY_REFERENCE_LORA_TYPE);
  });

  it('maps models into qwen and z-image LoRA categories', () => {
    expect(getLoraCategoryForModel('qwen-image')).toBe('qwen');
    expect(getLoraCategoryForModel('qwen-image-2512')).toBe('qwen');
    expect(getLoraCategoryForModel('z-image')).toBe('z-image');
  });
});
