import { describe, it, expect } from 'vitest';
import { useMediaGalleryDebugTools } from '../useMediaGalleryDebugTools';

describe('useMediaGalleryDebugTools', () => {
  it('exports expected members', () => {
    expect(useMediaGalleryDebugTools).toBeDefined();
  });

  it('useMediaGalleryDebugTools is a callable function', () => {
    expect(typeof useMediaGalleryDebugTools).toBe('function');
    expect(useMediaGalleryDebugTools.name).toBeDefined();
  });
});
