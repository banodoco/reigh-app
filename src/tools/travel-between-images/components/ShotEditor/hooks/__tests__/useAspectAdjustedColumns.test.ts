import { describe, it, expect } from 'vitest';
import { useAspectAdjustedColumns } from '../useAspectAdjustedColumns';

describe('useAspectAdjustedColumns', () => {
  it('exports expected members', () => {
    expect(useAspectAdjustedColumns).toBeDefined();
  });

  it('useAspectAdjustedColumns is a callable function', () => {
    expect(typeof useAspectAdjustedColumns).toBe('function');
    expect(useAspectAdjustedColumns.name).toBeDefined();
  });
});
