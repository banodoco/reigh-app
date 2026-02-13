import { describe, it, expect } from 'vitest';
import { validateHuggingFaceUrl, generateUniqueFilename } from '../validation-utils';

describe('validateHuggingFaceUrl', () => {
  it('rejects empty URL', () => {
    const result = validateHuggingFaceUrl('');
    expect(result.isValid).toBe(false);
    expect(result.message).toBe('URL is required');
  });

  it('rejects blob URLs', () => {
    const result = validateHuggingFaceUrl('blob:https://example.com/abc');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('blob URL');
  });

  it('rejects HuggingFace /blob/ URLs', () => {
    const result = validateHuggingFaceUrl('https://huggingface.co/user/model/blob/main/model.safetensors');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('Replace /blob/ with /resolve/');
  });

  it('rejects URLs without /resolve/', () => {
    const result = validateHuggingFaceUrl('https://huggingface.co/user/model/main/model.safetensors');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('/resolve/');
  });

  it('rejects non-HuggingFace /resolve/ URLs', () => {
    const result = validateHuggingFaceUrl('https://example.com/resolve/main/model.safetensors');
    expect(result.isValid).toBe(false);
    expect(result.message).toContain('HuggingFace URL');
  });

  it('accepts valid HuggingFace /resolve/ URLs', () => {
    const result = validateHuggingFaceUrl('https://huggingface.co/user/model/resolve/main/model.safetensors');
    expect(result.isValid).toBe(true);
    expect(result.message).toBe('');
  });
});

describe('generateUniqueFilename', () => {
  it('extracts filename from HuggingFace URL', () => {
    const url = 'https://huggingface.co/user/model/resolve/main/my_custom_lora_v2.safetensors';
    const result = generateUniqueFilename('My Lora', 'Wan 2.1', url);
    expect(result).toBe('my_custom_lora_v2.safetensors');
  });

  it('generates clean filename for generic HuggingFace filenames', () => {
    const url = 'https://huggingface.co/user/model/resolve/main/model.safetensors';
    const result = generateUniqueFilename('My Lora', 'Wan 2.1', url);
    expect(result).toBe('my_lora_wan_2_1.safetensors');
  });

  it('generates filename when URL has no filename', () => {
    const result = generateUniqueFilename('My Lora', 'Wan 2.1', '');
    expect(result).toBe('my_lora_wan_2_1.safetensors');
  });

  it('generates filename for short filenames', () => {
    const url = 'https://huggingface.co/user/model/resolve/main/lora.pt';
    const result = generateUniqueFilename('My Lora', 'Wan 2.1', url);
    // 'lora.pt' is 7 chars which is < 8 (the threshold)
    expect(result).toBe('my_lora_wan_2_1.pt');
  });

  it('adds suffix for duplicate filenames', () => {
    const url = 'https://huggingface.co/user/model/resolve/main/my_custom_lora_v2.safetensors';
    const existing = ['my_custom_lora_v2.safetensors'];
    const result = generateUniqueFilename('My Lora', 'Wan 2.1', url, existing);
    expect(result).toBe('my_custom_lora_v2_1.safetensors');
  });

  it('increments suffix to avoid multiple duplicates', () => {
    const url = 'https://huggingface.co/user/model/resolve/main/my_custom_lora_v2.safetensors';
    const existing = ['my_custom_lora_v2.safetensors', 'my_custom_lora_v2_1.safetensors'];
    const result = generateUniqueFilename('My Lora', 'Wan 2.1', url, existing);
    expect(result).toBe('my_custom_lora_v2_2.safetensors');
  });

  it('handles special characters in name', () => {
    const result = generateUniqueFilename('My LoRA!! (v2)', 'Wan 2.1', '');
    expect(result).not.toContain('!');
    expect(result).not.toContain('(');
    expect(result).toMatch(/^[a-z0-9_]+\.[a-z]+$/);
  });

  it('uses safetensors as default extension when URL has no extension', () => {
    const url = 'https://huggingface.co/user/model/resolve/main/';
    const result = generateUniqueFilename('My Lora', 'Wan 2.1', url);
    expect(result).toMatch(/\.safetensors$/);
  });
});
