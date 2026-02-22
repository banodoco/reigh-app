type TaskInvalidationScope = 'list' | 'detail' | 'counts' | 'all';

interface TaskInvalidationOptions {
  scope?: TaskInvalidationScope;
  reason: string;
  taskId?: string;
  projectId?: string;
  includeGenerations?: boolean;
  shotId?: string;
}
