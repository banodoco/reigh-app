import { describe, it, expect } from 'vitest';
import TimelineItem from '../TimelineItem';

describe('TimelineItem', () => {
  it('exports a memo-wrapped component', () => {
    expect(TimelineItem).toBeDefined();
    expect(typeof TimelineItem).toBe('object');
    expect(TimelineItem).toHaveProperty('$$typeof');
  });
});
