import type { TimelineConfig } from './index';

export type UndoSnapshot = {
  config: TimelineConfig;
  signature: string;
};

export type UndoEntry = {
  snapshot: UndoSnapshot;
  timestamp: string;
  label?: string;
  transactionId?: string;
};

export type CheckpointTriggerType =
  | 'session_boundary'
  | 'edit_distance'
  | 'semantic'
  | 'manual';

export type Checkpoint = {
  id: string;
  timelineId: string;
  config: TimelineConfig;
  createdAt: string;
  triggerType: CheckpointTriggerType;
  label: string;
  editsSinceLastCheckpoint: number;
};
