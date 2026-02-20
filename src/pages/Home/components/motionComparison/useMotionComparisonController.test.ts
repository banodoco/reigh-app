import { describe, expect, it } from 'vitest';
import { useMotionComparisonController } from './useMotionComparisonController';

describe('useMotionComparisonController module', () => {
  it('exports hook', () => {
    expect(useMotionComparisonController).toBeDefined();
  });
});
