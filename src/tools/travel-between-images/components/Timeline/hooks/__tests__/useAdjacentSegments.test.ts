import { describe, it, expect } from 'vitest';
import { useAdjacentSegments } from '../useAdjacentSegments';

describe('useAdjacentSegments', () => {
  it('exports expected members', () => {
    expect(useAdjacentSegments).toBeDefined();
  });

  it('useAdjacentSegments is a callable function', () => {
    expect(typeof useAdjacentSegments).toBe('function');
    expect(useAdjacentSegments.name).toBeDefined();
  });
});
