import { describe, it, expect } from 'vitest';
import { useSelection } from '../useSelection';

describe('useSelection', () => {
  it('exports expected members', () => {
    expect(useSelection).toBeDefined();
  });

  it('useSelection is a callable function', () => {
    expect(typeof useSelection).toBe('function');
    expect(useSelection.name).toBeDefined();
  });
});
