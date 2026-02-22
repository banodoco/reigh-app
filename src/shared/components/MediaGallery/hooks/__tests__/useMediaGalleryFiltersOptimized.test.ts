import { describe, it, expect } from 'vitest';
import { useMediaGalleryFiltersOptimized } from '../useMediaGalleryFiltersOptimized';

describe('useMediaGalleryFiltersOptimized', () => {
  it('exports expected members', () => {
    expect(useMediaGalleryFiltersOptimized).toBeDefined();
  });

  it('useMediaGalleryFiltersOptimized is a callable function', () => {
    expect(typeof useMediaGalleryFiltersOptimized).toBe('function');
    expect(useMediaGalleryFiltersOptimized.name).toBeDefined();
  });
});
