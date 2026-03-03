import { describe, expect, it } from 'vitest';
import { normalizeSegmentTaskParams } from './taskParamNormalizer.ts';

describe('normalizeSegmentTaskParams', () => {
  it('extracts segment-specific orchestrator values by child order', () => {
    const normalized = normalizeSegmentTaskParams({
      taskData: {
        params: {
          segment_index: 2,
          orchestrator_details: {
            base_prompts_expanded: ['p0', 'p1', 'p2'],
            negative_prompts_expanded: ['n0', 'n1', 'n2'],
            segment_frames_expanded: [10, 12, 14],
            frame_overlap_expanded: [1, 2, 3],
            pair_shot_generation_ids: ['pair-0', 'pair-1', 'pair-2'],
            input_image_generation_ids: ['img-a', 'img-b', 'img-c', 'img-d'],
          },
        },
      },
      childOrder: 1,
      isSingleItem: false,
    });

    expect(normalized.params.prompt).toBe('p1');
    expect(normalized.params.negative_prompt).toBe('n1');
    expect(normalized.params.num_frames).toBe(12);
    expect(normalized.params.frame_overlap).toBe(2);
    expect(normalized.params.start_image_generation_id).toBe('img-b');
    expect(normalized.params.end_image_generation_id).toBe('img-c');
    expect(normalized.segmentIndex).toBe(2);
    expect(normalized.pairShotGenerationId).toBe('pair-1');
  });

  it('flags single-item cases and falls back to default segment index', () => {
    const normalized = normalizeSegmentTaskParams({
      taskData: { params: {} },
      childOrder: null,
      isSingleItem: true,
    });

    expect(normalized.params._isSingleSegmentCase).toBe(true);
    expect(normalized.segmentIndex).toBe(0);
    expect(normalized.pairShotGenerationId).toBeNull();
  });
});
