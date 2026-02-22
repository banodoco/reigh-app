import { describe, it, expect } from 'vitest';
import { GRID_COLS_CLASSES, DOUBLE_TAP_THRESHOLD, SELECTION_BAR_DELAY, OPTIMISTIC_UPDATE_TIMEOUT, DEFAULT_BATCH_VIDEO_FRAMES } from '../constants';

describe('constants', () => {
  it('exports expected members', () => {
    expect(GRID_COLS_CLASSES).toBeDefined();
    expect(DOUBLE_TAP_THRESHOLD).toBeDefined();
    expect(SELECTION_BAR_DELAY).toBeDefined();
    expect(OPTIMISTIC_UPDATE_TIMEOUT).toBeDefined();
    expect(DEFAULT_BATCH_VIDEO_FRAMES).toBeDefined();
  });

  it('settings have expected shape', () => {
    expect(GRID_COLS_CLASSES).not.toBeNull();
    expect(DOUBLE_TAP_THRESHOLD).not.toBeNull();
    expect(SELECTION_BAR_DELAY).not.toBeNull();
  });
});
