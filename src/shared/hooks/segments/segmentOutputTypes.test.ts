import { describe, expect, expectTypeOf, it } from 'vitest';
import type { GenerationRow } from '@/domains/generation/types';
import type {
  ExpectedSegmentData,
  LiveTimelineRow,
  RawGenerationDbRow,
  SegmentSlot,
} from './segmentOutputTypes';

describe('segmentOutputTypes', () => {
  it('keeps placeholder and child slot variants distinct', () => {
    const childSlot: SegmentSlot = {
      type: 'child',
      child: { id: 'child-1' } as GenerationRow,
      index: 0,
      pairShotGenerationId: 'pair-1',
    };
    const placeholderSlot: SegmentSlot = {
      type: 'placeholder',
      index: 1,
      expectedFrames: 24,
      expectedPrompt: 'bridge prompt',
      startImage: 'start.png',
      endImage: 'end.png',
      pairShotGenerationId: 'pair-2',
    };

    expect(childSlot.type).toBe('child');
    expect(placeholderSlot.expectedFrames).toBe(24);
    expect(placeholderSlot.pairShotGenerationId).toBe('pair-2');
  });

  it('preserves the raw db row and timeline row contracts', () => {
    const rawRow: RawGenerationDbRow = {
      id: 'gen-1',
      location: null,
      thumbnail_url: 'thumb.png',
      pair_shot_generation_id: 'pair-1',
    };
    const timelineRow: LiveTimelineRow = {
      id: 'row-1',
      generation_id: 'gen-1',
      timeline_frame: 42,
    };
    const expected: ExpectedSegmentData = {
      count: 1,
      frames: [42],
      prompts: ['prompt'],
      inputImages: ['image.png'],
      inputImageGenIds: ['gen-1'],
      pairShotGenIds: ['pair-1'],
    };

    expect(rawRow.thumbnail_url).toBe('thumb.png');
    expect(timelineRow.timeline_frame).toBe(42);
    expect(expected.count).toBe(1);
    expectTypeOf<RawGenerationDbRow['pair_shot_generation_id']>().toEqualTypeOf<
      string | null | undefined
    >();
  });
});
