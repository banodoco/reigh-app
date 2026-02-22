import { describe, it, expect } from 'vitest';
import { useTimelineStripDrag } from '../useTimelineStripDrag';

describe('useTimelineStripDrag', () => {
  it('exports expected members', () => {
    expect(useTimelineStripDrag).toBeDefined();
  });

  it('useTimelineStripDrag is a callable function', () => {
    expect(typeof useTimelineStripDrag).toBe('function');
    expect(useTimelineStripDrag.name).toBeDefined();
  });
});
