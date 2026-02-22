import { describe, it, expect } from 'vitest';
import { useTemporaryVisibility } from '../useTemporaryVisibility';

describe('useTemporaryVisibility', () => {
  it('exports expected members', () => {
    expect(useTemporaryVisibility).toBeDefined();
  });

  it('useTemporaryVisibility is a callable function', () => {
    expect(typeof useTemporaryVisibility).toBe('function');
    expect(useTemporaryVisibility.name).toBeDefined();
  });
});
