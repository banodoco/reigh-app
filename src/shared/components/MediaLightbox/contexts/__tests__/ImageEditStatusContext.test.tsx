import { describe, it, expect } from 'vitest';
import { ImageEditStatusProvider, useImageEditStatusSafe } from '../ImageEditStatusContext';

describe('ImageEditStatusContext', () => {
  it('exports expected members', () => {
    expect(ImageEditStatusProvider).toBeDefined();
    expect(useImageEditStatusSafe).toBeDefined();
  });
});
