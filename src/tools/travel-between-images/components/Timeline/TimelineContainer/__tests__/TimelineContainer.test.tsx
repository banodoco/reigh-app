import { describe, it, expect } from 'vitest';
import TimelineContainer from '../TimelineContainer';

describe('TimelineContainer', () => {
  it('exports a memo-wrapped component', () => {
    expect(TimelineContainer).toBeDefined();
    expect(typeof TimelineContainer).toBe('object');
    expect(TimelineContainer).toHaveProperty('$$typeof');
  });
});
