import { describe, it, expect } from 'vitest';
import { useSegmentLightbox } from '../../segment/useSegmentLightbox';

describe('useSegmentLightbox', () => {
  it('exports expected members', () => {
    expect(useSegmentLightbox).toBeDefined();
  });

  it('useSegmentLightbox is a callable function', () => {
    expect(typeof useSegmentLightbox).toBe('function');
    expect(useSegmentLightbox.name).toBeDefined();
  });
});
