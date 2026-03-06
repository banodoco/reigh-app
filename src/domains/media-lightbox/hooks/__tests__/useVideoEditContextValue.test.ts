import { describe, it, expect } from 'vitest';
import { useVideoEditContextValue } from '../useVideoEditContextValue';

describe('useVideoEditContextValue', () => {
  it('exports expected members', () => {
    expect(useVideoEditContextValue).toBeDefined();
  });

  it('useVideoEditContextValue is a callable function', () => {
    expect(typeof useVideoEditContextValue).toBe('function');
    expect(useVideoEditContextValue.name).toBeDefined();
  });
});
