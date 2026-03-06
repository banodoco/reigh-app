import { describe, it, expect } from 'vitest';
import { useStarToggle } from '../useStarToggle';

describe('useStarToggle', () => {
  it('exports expected members', () => {
    expect(useStarToggle).toBeDefined();
  });

  it('useStarToggle is a callable function', () => {
    expect(typeof useStarToggle).toBe('function');
    expect(useStarToggle.name).toBeDefined();
  });
});
