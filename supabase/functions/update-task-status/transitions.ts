import { type TaskStatus, VALID_TASK_STATUSES } from './types.ts';

const VALID_STATUS_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  Queued: ['In Progress', 'Failed', 'Cancelled'],
  'In Progress': ['Complete', 'Failed', 'Cancelled', 'Queued'],
  Complete: [],
  Failed: [],
  Cancelled: [],
};

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (VALID_TASK_STATUSES as readonly string[]).includes(value);
}

export function allowedTransitions(currentStatus: TaskStatus): readonly TaskStatus[] {
  return VALID_STATUS_TRANSITIONS[currentStatus] ?? [];
}

export function isTransitionAllowed(currentStatus: TaskStatus, nextStatus: TaskStatus): boolean {
  return allowedTransitions(currentStatus).includes(nextStatus);
}
