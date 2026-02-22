import { describe, it, expect } from 'vitest';
import { usePairData } from '../usePairData';

describe('usePairData', () => {
  it('exports expected members', () => {
    expect(usePairData).toBeDefined();
  });

  it('usePairData is a callable function', () => {
    expect(typeof usePairData).toBe('function');
    expect(usePairData.name).toBeDefined();
  });
});
