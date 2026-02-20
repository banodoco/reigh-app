import { describe, expect, it } from 'vitest';
import { SEGMENT_TYPE_CONFIG, TASK_TYPES, VARIANT_TYPE_DEFAULT } from './constants.ts';

describe('complete_task/constants', () => {
  it('exposes task type constants and default variant type', () => {
    expect(TASK_TYPES.TRAVEL_SEGMENT).toBe('travel_segment');
    expect(VARIANT_TYPE_DEFAULT).toBe('generated');
  });

  it('contains orchestrator completion rules for join clips flow', () => {
    expect(SEGMENT_TYPE_CONFIG[TASK_TYPES.JOIN_CLIPS_SEGMENT]?.waitForFinalStepType).toBe(
      TASK_TYPES.JOIN_FINAL_STITCH,
    );
  });
});
