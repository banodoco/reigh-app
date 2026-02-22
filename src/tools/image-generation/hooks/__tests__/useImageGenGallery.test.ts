import { describe, it, expect } from 'vitest';
import { useImageGenGallery } from '../useImageGenGallery';

describe('useImageGenGallery', () => {
  it('exports expected members', () => {
    expect(useImageGenGallery).toBeDefined();
  });

  it('useImageGenGallery is a callable function', () => {
    expect(typeof useImageGenGallery).toBe('function');
    expect(useImageGenGallery.name).toBeDefined();
  });
});
