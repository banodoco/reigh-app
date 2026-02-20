export const VALID_TASK_STATUSES = ['Queued', 'In Progress', 'Complete', 'Failed', 'Cancelled'] as const;

export type TaskStatus = typeof VALID_TASK_STATUSES[number];

export interface UpdateTaskStatusRequest {
  task_id: string;
  status: TaskStatus;
  output_location?: string;
  attempts?: number;
  error_details?: string;
  clear_worker?: boolean;
  reset_generation_started_at?: boolean;
}

export interface TaskStatusRow {
  id: string;
  status: TaskStatus;
  params?: unknown;
  generation_started_at?: string | null;
  generation_processed_at?: string | null;
}
