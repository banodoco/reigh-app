import { describe, it, expect } from 'vitest';
import { useVariantActions } from '../useVariantActions';

describe('useVariantActions', () => {
  it('exports expected members', () => {
    expect(useVariantActions).toBeDefined();
  });

  it('useVariantActions is a callable function', () => {
    expect(typeof useVariantActions).toBe('function');
    expect(useVariantActions.name).toBeDefined();
  });
});
