import { describe, it, expect } from 'vitest';
import { useMediaGalleryPagination } from '../useMediaGalleryPagination';

describe('useMediaGalleryPagination', () => {
  it('exports expected members', () => {
    expect(useMediaGalleryPagination).toBeDefined();
  });

  it('useMediaGalleryPagination is a callable function', () => {
    expect(typeof useMediaGalleryPagination).toBe('function');
    expect(useMediaGalleryPagination.name).toBeDefined();
  });
});
