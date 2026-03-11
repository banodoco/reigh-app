import { describe, expect, it } from 'vitest';
import type {
  ExpectedSegmentData,
  LiveTimelineRow,
  RawGenerationDbRow,
  SegmentSlot,
} from './segmentOutputTypes';
import * as segmentOutputTypesModule from './segmentOutputTypes';

describe('segmentOutputTypes', () => {
  it('loads the module and supports the expected segment slot shapes', () => {
    const childSlot: SegmentSlot = {
      type: 'child',
      child: { id: 'child-1' } as never,
      index: 0,
      pairShotGenerationId: 'pair-1',
    };
    const placeholderSlot: SegmentSlot = {
      type: 'placeholder',
      index: 1,
      expectedFrames: 18,
      expectedPrompt: 'pan right',
      startImage: 'start.png',
      endImage: 'end.png',
      pairShotGenerationId: 'pair-2',
    };
    const expectedSegmentData: ExpectedSegmentData = {
      count: 2,
      frames: [12, 18],
      prompts: ['hold', 'pan right'],
      inputImages: ['start.png', 'middle.png', 'end.png'],
      inputImageGenIds: ['gen-start', 'gen-middle', 'gen-end'],
      pairShotGenIds: ['pair-1', 'pair-2'],
    };
    const rawRow: RawGenerationDbRow = {
      id: 'row-1',
      location: null,
      thumbnail_url: null,
    };
    const liveTimelineRow: LiveTimelineRow = {
      id: 'timeline-1',
      generation_id: 'gen-start',
      timeline_frame: 0,
    };

    expect(segmentOutputTypesModule).toBeTypeOf('object');
    expect(childSlot.type).toBe('child');
    expect(placeholderSlot.expectedFrames).toBe(18);
    expect(expectedSegmentData.count).toBe(2);
    expect(rawRow.id).toBe('row-1');
    expect(liveTimelineRow.generation_id).toBe('gen-start');
  });
});
