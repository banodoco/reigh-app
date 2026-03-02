import { describe, it, expect } from 'vitest';
import { useEndpointDrag } from '../../drag/useEndpointDrag';

describe('useEndpointDrag', () => {
  it('exports expected members', () => {
    expect(useEndpointDrag).toBeDefined();
  });

  it('useEndpointDrag is a callable function', () => {
    expect(typeof useEndpointDrag).toBe('function');
    expect(useEndpointDrag.name).toBeDefined();
  });
});
