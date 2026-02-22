import { describe, it, expect } from 'vitest';
import { useSmoothContinuations } from '../useSmoothContinuations';

describe('useSmoothContinuations', () => {
  it('exports expected members', () => {
    expect(useSmoothContinuations).toBeDefined();
  });

  it('useSmoothContinuations is a callable function', () => {
    expect(typeof useSmoothContinuations).toBe('function');
    expect(useSmoothContinuations.name).toBeDefined();
  });
});
