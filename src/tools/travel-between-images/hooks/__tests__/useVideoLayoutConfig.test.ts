import { describe, it, expect } from 'vitest';
import { useVideoLayoutConfig } from '../useVideoLayoutConfig';

describe('useVideoLayoutConfig', () => {
  it('exports expected members', () => {
    expect(useVideoLayoutConfig).toBeDefined();
  });

  it('useVideoLayoutConfig is a callable function', () => {
    expect(typeof useVideoLayoutConfig).toBe('function');
    expect(useVideoLayoutConfig.name).toBeDefined();
  });
});
