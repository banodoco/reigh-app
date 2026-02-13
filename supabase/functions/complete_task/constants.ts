/**
 * Constants for complete_task edge function
 */

export const TASK_TYPES = {
  TRAVEL_SEGMENT: 'travel_segment',
  JOIN_CLIPS_SEGMENT: 'join_clips_segment',
  INDIVIDUAL_TRAVEL_SEGMENT: 'individual_travel_segment',
  JOIN_FINAL_STITCH: 'join_final_stitch',
  TRAVEL_STITCH: 'travel_stitch',
} as const;

export type TaskType = typeof TASK_TYPES[keyof typeof TASK_TYPES];

export const TOOL_TYPES = {
  TRAVEL_BETWEEN_IMAGES: 'travel-between-images',
} as const;

export type ToolType = typeof TOOL_TYPES[keyof typeof TOOL_TYPES];

export const VARIANT_TYPE_DEFAULT = 'edit' as const;

export interface SegmentTypeConfig {
  segmentType: TaskType;
  /** Final step tasks (e.g. join_final_stitch) complete the orchestrator directly — no sibling counting. */
  isFinalStep?: boolean;
  /** Segment type to query for billing timestamps when this is a final step. */
  billingSegmentType?: TaskType;
  /** Wait for a task of this type before marking the orchestrator complete. */
  waitForFinalStepType?: TaskType;
}

export const SEGMENT_TYPE_CONFIG: Record<string, SegmentTypeConfig> = {
  [TASK_TYPES.TRAVEL_SEGMENT]: {
    segmentType: TASK_TYPES.TRAVEL_SEGMENT,
  },
  [TASK_TYPES.JOIN_CLIPS_SEGMENT]: {
    segmentType: TASK_TYPES.JOIN_CLIPS_SEGMENT,
    waitForFinalStepType: TASK_TYPES.JOIN_FINAL_STITCH,
  },
  [TASK_TYPES.JOIN_FINAL_STITCH]: {
    segmentType: TASK_TYPES.JOIN_FINAL_STITCH,
    isFinalStep: true,
    billingSegmentType: TASK_TYPES.JOIN_CLIPS_SEGMENT,
  },
};
