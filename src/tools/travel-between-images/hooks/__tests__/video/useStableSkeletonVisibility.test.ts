import { describe, it, expect } from 'vitest';
import { useStableSkeletonVisibility } from '../../video/useStableSkeletonVisibility';

describe('useStableSkeletonVisibility', () => {
  it('exports expected members', () => {
    expect(useStableSkeletonVisibility).toBeDefined();
  });

  it('useStableSkeletonVisibility is a callable function', () => {
    expect(typeof useStableSkeletonVisibility).toBe('function');
    expect(useStableSkeletonVisibility.name).toBeDefined();
  });
});
