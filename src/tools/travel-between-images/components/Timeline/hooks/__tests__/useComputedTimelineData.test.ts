import { describe, it, expect } from 'vitest';
import { useComputedTimelineData } from '../useComputedTimelineData';

describe('useComputedTimelineData', () => {
  it('exports expected members', () => {
    expect(useComputedTimelineData).toBeDefined();
  });

  it('useComputedTimelineData is a callable function', () => {
    expect(typeof useComputedTimelineData).toBe('function');
    expect(useComputedTimelineData.name).toBeDefined();
  });
});
