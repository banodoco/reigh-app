import { describe, it, expect } from 'vitest';
import { useImageLoading } from '../useImageLoading';

describe('useImageLoading', () => {
  it('exports expected members', () => {
    expect(useImageLoading).toBeDefined();
  });

  it('useImageLoading is a callable function', () => {
    expect(typeof useImageLoading).toBe('function');
    expect(useImageLoading.name).toBeDefined();
  });
});
