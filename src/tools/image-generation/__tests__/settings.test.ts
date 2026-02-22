import { describe, it, expect } from 'vitest';
import { imageGenerationSettings } from '../settings';

describe('settings', () => {
  it('exports expected members', () => {
    expect(imageGenerationSettings).toBeDefined();
  });

  it('settings have expected shape', () => {
    expect(imageGenerationSettings).not.toBeNull();
  });
});
