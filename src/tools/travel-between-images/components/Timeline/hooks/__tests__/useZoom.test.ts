import { describe, it, expect } from 'vitest';
import { useZoom } from '../useZoom';

describe('useZoom', () => {
  it('exports expected members', () => {
    expect(useZoom).toBeDefined();
  });

  it('useZoom is a callable function', () => {
    expect(typeof useZoom).toBe('function');
    expect(useZoom.name).toBeDefined();
  });
});
