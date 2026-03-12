import { describe, it, expect } from 'vitest';
import {
  parseTaskParams,
  deriveInputImages,
  derivePrompt,
  extractLoras,
  isImageEditTaskType,
  isVideoEnhanceTaskType,
  isImageEnhanceTaskType,
} from '../../lib/taskParamsUtils';

describe('parseTaskParams', () => {
  it('returns empty object for null/undefined', () => {
    expect(parseTaskParams(null)).toEqual({});
    expect(parseTaskParams(undefined)).toEqual({});
  });

  it('parses valid JSON string', () => {
    expect(parseTaskParams('{"prompt":"a cat"}')).toEqual({ prompt: 'a cat' });
  });

  it('returns empty object for invalid JSON string', () => {
    expect(parseTaskParams('not json')).toEqual({});
  });

  it('returns object params as-is', () => {
    const params = { prompt: 'a cat', seed: 42 };
    expect(parseTaskParams(params)).toBe(params);
  });
});

describe('deriveInputImages', () => {
  it('returns empty for empty params', () => {
    expect(deriveInputImages({})).toEqual([]);
  });

  it('extracts image_url from simple task', () => {
    expect(deriveInputImages({ image_url: 'https://img.png' })).toEqual(['https://img.png']);
  });

  it('extracts multiple image fields', () => {
    const result = deriveInputImages({
      image_url: 'https://a.png',
      mask_url: 'https://mask.png',
    });
    expect(result).toContain('https://a.png');
    expect(result).toContain('https://mask.png');
  });

  it('deduplicates URLs', () => {
    const result = deriveInputImages({
      image_url: 'https://same.png',
      image: 'https://same.png',
    });
    expect(result).toEqual(['https://same.png']);
  });

  it('uses segment-specific images for segment tasks', () => {
    const result = deriveInputImages({
      segment_index: 0,
      individual_segment_params: {
        input_image_paths_resolved: ['https://seg-a.png', 'https://seg-b.png'],
      },
      // Full orchestrator has more images, but segment should only use its own
      orchestrator_details: {
        input_image_paths_resolved: ['https://all-a.png', 'https://all-b.png', 'https://all-c.png'],
      },
    });
    expect(result).toEqual(['https://seg-a.png', 'https://seg-b.png']);
  });

  it('falls back to start/end image URLs for segment tasks', () => {
    const result = deriveInputImages({
      segment_index: 1,
      individual_segment_params: {
        start_image_url: 'https://start.png',
        end_image_url: 'https://end.png',
      },
    });
    expect(result).toEqual(['https://start.png', 'https://end.png']);
  });

  it('extracts from orchestrator_details for non-segment tasks', () => {
    const result = deriveInputImages({
      orchestrator_details: {
        input_image_paths_resolved: ['https://a.png', 'https://b.png'],
      },
    });
    expect(result).toContain('https://a.png');
    expect(result).toContain('https://b.png');
  });

  it('handles images array', () => {
    const result = deriveInputImages({
      images: ['https://a.png', 'https://b.png'],
    });
    expect(result).toContain('https://a.png');
    expect(result).toContain('https://b.png');
  });

  it('filters out non-string values from arrays', () => {
    const result = deriveInputImages({
      images: ['https://a.png', null, 42, 'https://b.png'],
    });
    expect(result).toEqual(['https://a.png', 'https://b.png']);
  });
});

describe('derivePrompt', () => {
  it('returns null for empty params', () => {
    expect(derivePrompt({})).toBeNull();
  });

  it('extracts top-level prompt', () => {
    expect(derivePrompt({ prompt: 'a cat' })).toBe('a cat');
  });

  it('extracts base_prompt', () => {
    expect(derivePrompt({ base_prompt: 'a dog' })).toBe('a dog');
  });

  it('prefers enhanced prompt for segment tasks', () => {
    expect(derivePrompt({
      segment_index: 0,
      individual_segment_params: {
        enhanced_prompt: 'enhanced cat',
        base_prompt: 'base cat',
      },
    })).toBe('enhanced cat');
  });

  it('falls back to base_prompt for segment tasks without enhanced', () => {
    expect(derivePrompt({
      segment_index: 0,
      individual_segment_params: {
        base_prompt: 'base cat',
      },
    })).toBe('base cat');
  });

  it('uses enhanced_prompts_expanded array for segment tasks', () => {
    expect(derivePrompt({
      segment_index: 1,
      orchestrator_details: {
        enhanced_prompts_expanded: ['prompt-0', 'prompt-1', 'prompt-2'],
      },
    })).toBe('prompt-1');
  });

  it('prefers base_prompt over enhanced for non-segment orchestrated tasks', () => {
    expect(derivePrompt({
      orchestrator_details: {
        enhanced_prompt: 'enhanced',
        base_prompt: 'base',
      },
    })).toBe('base');
  });

  it('falls back through the priority chain for non-segment tasks', () => {
    expect(derivePrompt({
      orchestrator_details: {
        base_prompt: 'orchestrator base',
      },
    })).toBe('orchestrator base');
  });

  it('does not show per-pair overrides when global prompt is cleared', () => {
    expect(derivePrompt({
      orchestrator_details: {
        base_prompt: '',
        base_prompts_expanded: ['river flowing', 'camera pans up'],
        enhanced_prompts_expanded: ['', ''],
      },
    })).toBeNull();
  });

  it('prefers global base_prompt over per-pair overrides', () => {
    expect(derivePrompt({
      orchestrator_details: {
        base_prompt: 'global prompt',
        base_prompts_expanded: ['pair override 1', 'pair override 2'],
      },
    })).toBe('global prompt');
  });
});

describe('extractLoras', () => {
  it('returns empty for no loras', () => {
    expect(extractLoras({})).toEqual([]);
  });

  it('extracts from array format', () => {
    const result = extractLoras({
      loras: [
        { url: 'https://lora1.safetensors', strength: 0.8 },
        { url: 'https://lora2.ckpt', multiplier: 1.2 },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ url: 'https://lora1.safetensors', strength: 0.8 });
    expect(result[1]).toMatchObject({ url: 'https://lora2.ckpt', strength: 1.2 });
  });

  it('extracts from object format (additional_loras)', () => {
    const result = extractLoras({
      additional_loras: {
        'https://lora1.safetensors': 0.8,
        'https://lora2.safetensors': 1.0,
      },
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ url: 'https://lora1.safetensors', strength: 0.8 });
  });

  it('generates display names from URLs', () => {
    const result = extractLoras({
      loras: [{ url: 'https://example.com/my_cool_model.safetensors', strength: 1 }],
    });
    expect(result[0].displayName).toBe('my cool model');
  });

  it('defaults strength to 1 when missing', () => {
    const result = extractLoras({
      loras: [{ url: 'https://example.com/model.safetensors' }],
    });
    expect(result[0].strength).toBe(1);
  });

  it('checks orchestrator_details for loras', () => {
    const result = extractLoras({
      orchestrator_details: {
        loras: [{ url: 'https://lora.safetensors', strength: 0.5 }],
      },
    });
    expect(result).toHaveLength(1);
  });
});

describe('task type guards', () => {
  describe('isImageEditTaskType', () => {
    it('returns true for known image edit types', () => {
      expect(isImageEditTaskType('kontext_image_edit')).toBe(true);
      expect(isImageEditTaskType('flux_image_edit')).toBe(true);
      expect(isImageEditTaskType('image_inpaint')).toBe(true);
    });

    it('returns false for non-edit types', () => {
      expect(isImageEditTaskType('text_to_image')).toBe(false);
      expect(isImageEditTaskType(undefined)).toBe(false);
    });
  });

  describe('isVideoEnhanceTaskType', () => {
    it('returns true for video_enhance', () => {
      expect(isVideoEnhanceTaskType('video_enhance')).toBe(true);
    });

    it('returns false for other types', () => {
      expect(isVideoEnhanceTaskType('video_gen')).toBe(false);
      expect(isVideoEnhanceTaskType(undefined)).toBe(false);
    });
  });

  describe('isImageEnhanceTaskType', () => {
    it('returns true for supported image upscale task types', () => {
      expect(isImageEnhanceTaskType('image-upscale')).toBe(true);
      expect(isImageEnhanceTaskType('image_upscale')).toBe(true);
    });

    it('returns false for other types', () => {
      expect(isImageEnhanceTaskType('image_gen')).toBe(false);
      expect(isImageEnhanceTaskType(undefined)).toBe(false);
    });
  });
});
