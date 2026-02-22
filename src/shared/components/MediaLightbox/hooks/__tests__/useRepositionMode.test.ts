import { describe, it, expect } from 'vitest';
import { useRepositionMode } from '../useRepositionMode';

describe('useRepositionMode', () => {
  it('exports expected members', () => {
    expect(useRepositionMode).toBeDefined();
  });

  it('useRepositionMode is a callable function', () => {
    expect(typeof useRepositionMode).toBe('function');
    expect(useRepositionMode.name).toBeDefined();
  });
});
