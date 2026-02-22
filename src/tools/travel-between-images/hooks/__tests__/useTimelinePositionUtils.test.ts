import { describe, it, expect } from 'vitest';
import { useTimelinePositionUtils } from '../useTimelinePositionUtils';

describe('useTimelinePositionUtils', () => {
  it('exports expected members', () => {
    expect(useTimelinePositionUtils).toBeDefined();
  });

  it('useTimelinePositionUtils is a callable function', () => {
    expect(typeof useTimelinePositionUtils).toBe('function');
    expect(useTimelinePositionUtils.name).toBeDefined();
  });
});
