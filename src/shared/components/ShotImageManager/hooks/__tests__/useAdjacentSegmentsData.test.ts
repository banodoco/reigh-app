import { describe, it, expect } from 'vitest';
import { useAdjacentSegmentsData } from '../useAdjacentSegmentsData';

describe('useAdjacentSegmentsData', () => {
  it('exports expected members', () => {
    expect(useAdjacentSegmentsData).toBeDefined();
  });

  it('useAdjacentSegmentsData is a callable function', () => {
    expect(typeof useAdjacentSegmentsData).toBe('function');
    expect(useAdjacentSegmentsData.name).toBeDefined();
  });
});
