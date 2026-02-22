import { describe, it, expect } from 'vitest';
import { useInpainting } from '../useInpainting';

describe('useInpainting', () => {
  it('exports expected hook', () => {
    expect(useInpainting).toBeDefined();
    expect(typeof useInpainting).toBe('function');
    expect(useInpainting.name).toBeDefined();
  });
});
