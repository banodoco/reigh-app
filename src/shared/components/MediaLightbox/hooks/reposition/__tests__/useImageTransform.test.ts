import { describe, it, expect } from 'vitest';
import { useImageTransform } from '../useImageTransform';

describe('useImageTransform', () => {
  it('exports expected members', () => {
    expect(useImageTransform).toBeDefined();
  });

  it('useImageTransform is a callable function', () => {
    expect(typeof useImageTransform).toBe('function');
    expect(useImageTransform.name).toBeDefined();
  });
});
