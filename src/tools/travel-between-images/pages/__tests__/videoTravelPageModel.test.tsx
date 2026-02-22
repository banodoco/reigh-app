import { describe, it, expect } from 'vitest';
import { VideoTravelContent, useScrollToTopOnHashChange, useShotSortModeState, useProjectErrorTimer, useSyncCurrentShotId } from '../videoTravelPageModel';

describe('videoTravelPageModel', () => {
  it('exports expected members', () => {
    expect(VideoTravelContent).toBeDefined();
    expect(useScrollToTopOnHashChange).toBeDefined();
    expect(useShotSortModeState).toBeDefined();
    expect(useProjectErrorTimer).toBeDefined();
    expect(useSyncCurrentShotId).toBeDefined();
  });
});
