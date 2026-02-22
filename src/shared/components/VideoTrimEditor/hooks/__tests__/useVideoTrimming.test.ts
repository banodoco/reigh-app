import { describe, it, expect } from 'vitest';
import { useVideoTrimming } from '../useVideoTrimming';

describe('useVideoTrimming', () => {
  it('exports expected members', () => {
    expect(useVideoTrimming).toBeDefined();
  });

  it('useVideoTrimming is a callable function', () => {
    expect(typeof useVideoTrimming).toBe('function');
    expect(useVideoTrimming.name).toBeDefined();
  });
});
