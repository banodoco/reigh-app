import { describe, it, expect } from 'vitest';
import { useRepositionDrag } from '../useRepositionDrag';

describe('useRepositionDrag', () => {
  it('exports expected members', () => {
    expect(useRepositionDrag).toBeDefined();
  });

  it('useRepositionDrag is a callable function', () => {
    expect(typeof useRepositionDrag).toBe('function');
    expect(useRepositionDrag.name).toBeDefined();
  });
});
