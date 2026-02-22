import { describe, it, expect } from 'vitest';
import { ImageEditFormProvider, useImageEditFormSafe } from '../ImageEditFormContext';

describe('ImageEditFormContext', () => {
  it('exports expected members', () => {
    expect(ImageEditFormProvider).toBeDefined();
    expect(useImageEditFormSafe).toBeDefined();
  });
});
