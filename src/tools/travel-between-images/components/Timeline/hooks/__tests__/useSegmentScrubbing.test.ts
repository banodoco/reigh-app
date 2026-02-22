import { describe, it, expect } from 'vitest';
import { useSegmentScrubbing } from '../useSegmentScrubbing';

describe('useSegmentScrubbing', () => {
  it('exports expected members', () => {
    expect(useSegmentScrubbing).toBeDefined();
  });

  it('useSegmentScrubbing is a callable function', () => {
    expect(typeof useSegmentScrubbing).toBe('function');
    expect(useSegmentScrubbing.name).toBeDefined();
  });
});
