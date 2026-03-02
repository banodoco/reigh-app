import { describe, it, expect } from 'vitest';
import { useOutputSelection } from '../../video/useOutputSelection';

describe('useOutputSelection', () => {
  it('exports expected members', () => {
    expect(useOutputSelection).toBeDefined();
  });

  it('useOutputSelection is a callable function', () => {
    expect(typeof useOutputSelection).toBe('function');
    expect(useOutputSelection.name).toBeDefined();
  });
});
