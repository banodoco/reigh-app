import { TOOL_IDS } from '@/shared/lib/toolConstants';

interface TrainingDataHelperSettings {
  // Basic settings for the tool
  autoPlaySegments: boolean;
  defaultSegmentDuration: number; // in seconds
  segmentOverlap: number; // in milliseconds
}

export const trainingDataHelperSettings = {
  id: TOOL_IDS.TRAINING_DATA_HELPER,
  scope: ['user'] as const,
  defaults: {
    autoPlaySegments: true,
    defaultSegmentDuration: 10, // 10 seconds
    segmentOverlap: 500, // 500ms overlap
  } satisfies TrainingDataHelperSettings,
}; 