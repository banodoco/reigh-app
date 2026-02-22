import { describe, it, expect } from 'vitest';
import { useGenerationLineage } from '../useGenerationLineage';

describe('useGenerationLineage', () => {
  it('exports expected members', () => {
    expect(useGenerationLineage).toBeDefined();
  });

  it('useGenerationLineage is a callable function', () => {
    expect(typeof useGenerationLineage).toBe('function');
    expect(useGenerationLineage.name).toBeDefined();
  });
});
