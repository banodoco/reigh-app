import { describe, it, expect } from 'vitest';
import { useMediaGalleryStateOptimized } from '../useMediaGalleryStateOptimized';

describe('useMediaGalleryStateOptimized', () => {
  it('exports expected members', () => {
    expect(useMediaGalleryStateOptimized).toBeDefined();
  });

  it('useMediaGalleryStateOptimized is a callable function', () => {
    expect(typeof useMediaGalleryStateOptimized).toBe('function');
    expect(useMediaGalleryStateOptimized.name).toBeDefined();
  });
});
