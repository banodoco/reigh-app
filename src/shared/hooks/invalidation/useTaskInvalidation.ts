export type TaskInvalidationScope = 'list' | 'detail' | 'counts' | 'all';

export interface TaskInvalidationOptions {
  scope?: TaskInvalidationScope;
  reason: string;
  taskId?: string;
  projectId?: string;
  includeGenerations?: boolean;
  shotId?: string;
}
