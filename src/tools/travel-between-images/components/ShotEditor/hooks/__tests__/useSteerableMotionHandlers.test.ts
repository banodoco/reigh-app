import { describe, it, expect } from 'vitest';
import { useSteerableMotionHandlers } from '../useSteerableMotionHandlers';

describe('useSteerableMotionHandlers', () => {
  it('exports expected members', () => {
    expect(useSteerableMotionHandlers).toBeDefined();
  });

  it('useSteerableMotionHandlers is a callable function', () => {
    expect(typeof useSteerableMotionHandlers).toBe('function');
    expect(useSteerableMotionHandlers.name).toBeDefined();
  });
});
