import { describe, it, expect } from 'vitest';
import { useMediaGalleryHandlers } from '../useMediaGalleryHandlers';

describe('useMediaGalleryHandlers', () => {
  it('exports expected members', () => {
    expect(useMediaGalleryHandlers).toBeDefined();
  });

  it('useMediaGalleryHandlers is a callable function', () => {
    expect(typeof useMediaGalleryHandlers).toBe('function');
    expect(useMediaGalleryHandlers.name).toBeDefined();
  });
});
