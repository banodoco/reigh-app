import { describe, it, expect } from 'vitest';
import { useLayoutMode } from '../useLayoutMode';

describe('useLayoutMode', () => {
  it('exports expected members', () => {
    expect(useLayoutMode).toBeDefined();
  });

  it('useLayoutMode is a callable function', () => {
    expect(typeof useLayoutMode).toBe('function');
    expect(useLayoutMode.name).toBeDefined();
  });
});
