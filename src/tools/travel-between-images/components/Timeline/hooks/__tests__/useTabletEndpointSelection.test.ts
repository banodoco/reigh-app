import { describe, it, expect } from 'vitest';
import { useTabletEndpointSelection } from '../useTabletEndpointSelection';

describe('useTabletEndpointSelection', () => {
  it('exports expected members', () => {
    expect(useTabletEndpointSelection).toBeDefined();
  });

  it('useTabletEndpointSelection is a callable function', () => {
    expect(typeof useTabletEndpointSelection).toBe('function');
    expect(useTabletEndpointSelection.name).toBeDefined();
  });
});
