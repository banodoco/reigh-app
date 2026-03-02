import { describe, it, expect } from 'vitest';
import { usePendingFrames } from '../../segment/usePendingFrames';

describe('usePendingFrames', () => {
  it('exports expected members', () => {
    expect(usePendingFrames).toBeDefined();
  });

  it('usePendingFrames is a callable function', () => {
    expect(typeof usePendingFrames).toBe('function');
    expect(usePendingFrames.name).toBeDefined();
  });
});
