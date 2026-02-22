import { describe, it, expect } from 'vitest';
import { useTimelineDrag } from '../useTimelineDrag';

describe('useTimelineDrag', () => {
  it('exports expected members', () => {
    expect(useTimelineDrag).toBeDefined();
  });

  it('useTimelineDrag is a callable function', () => {
    expect(typeof useTimelineDrag).toBe('function');
    expect(useTimelineDrag.name).toBeDefined();
  });
});
