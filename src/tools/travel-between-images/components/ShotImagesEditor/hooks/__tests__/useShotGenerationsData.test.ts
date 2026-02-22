import { describe, it, expect } from 'vitest';
import { useShotGenerationsData } from '../useShotGenerationsData';

describe('useShotGenerationsData', () => {
  it('exports expected members', () => {
    expect(useShotGenerationsData).toBeDefined();
  });

  it('useShotGenerationsData is a callable function', () => {
    expect(typeof useShotGenerationsData).toBe('function');
    expect(useShotGenerationsData.name).toBeDefined();
  });
});
