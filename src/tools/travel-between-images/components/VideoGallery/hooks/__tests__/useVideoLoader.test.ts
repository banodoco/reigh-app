import { describe, it, expect } from 'vitest';
import { useVideoLoader } from '../useVideoLoader';

describe('useVideoLoader', () => {
  it('exports expected members', () => {
    expect(useVideoLoader).toBeDefined();
  });

  it('useVideoLoader is a callable function', () => {
    expect(typeof useVideoLoader).toBe('function');
    expect(useVideoLoader.name).toBeDefined();
  });
});
