import { describe, it, expect } from 'vitest';
import { useVariantSelection } from '../useVariantSelection';

describe('useVariantSelection', () => {
  it('exports expected members', () => {
    expect(useVariantSelection).toBeDefined();
  });

  it('useVariantSelection is a callable function', () => {
    expect(typeof useVariantSelection).toBe('function');
    expect(useVariantSelection.name).toBeDefined();
  });
});
