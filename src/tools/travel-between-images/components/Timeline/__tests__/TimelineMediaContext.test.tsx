import { describe, it, expect } from 'vitest';
import { TimelineMediaProvider, useTimelineMedia } from '../TimelineMediaContext';

describe('TimelineMediaContext', () => {
  it('exports expected members', () => {
    expect(TimelineMediaProvider).toBeDefined();
    expect(useTimelineMedia).toBeDefined();
  });
});
