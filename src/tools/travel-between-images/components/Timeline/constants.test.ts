import { describe, it, expect } from 'vitest';
import {
  TIMELINE_HORIZONTAL_PADDING,
  TIMELINE_PADDING_OFFSET,
} from './constants';

describe('Timeline constants', () => {
  it('keeps the baseline horizontal padding stable', () => {
    expect(TIMELINE_HORIZONTAL_PADDING).toBe(20);
  });

  it('derives padding offset from horizontal padding plus image half-width', () => {
    expect(TIMELINE_PADDING_OFFSET).toBeGreaterThan(TIMELINE_HORIZONTAL_PADDING);
    expect(TIMELINE_PADDING_OFFSET - TIMELINE_HORIZONTAL_PADDING).toBe(48);
  });
});
