export interface CreditsManagementProps {
  initialTab?: 'purchase' | 'history' | 'task-log';
  mode?: 'add-credits' | 'transactions' | 'all';
}

export interface TaskLogFilters {
  costFilter: 'all' | 'free' | 'paid';
  status: string[];
  taskTypes: string[];
  projectIds: string[];
}

export interface TaskLogTask {
  id: string;
  createdAt: string;
  taskType: string;
  projectName?: string;
  status: string;
  duration?: number;
  cost?: number;
}

export interface TaskLogPagination {
  currentPage: number;
  totalPages: number;
  total: number;
  hasMore: boolean;
}

export interface TaskLogAvailableFilters {
  statuses: string[];
  taskTypes: string[];
  projects: Array<{ id: string; name: string }>;
}

export type AutoTopupState =
  | 'loading'
  | 'active'
  | 'setup-but-disabled'
  | 'enabled-but-not-setup'
  | 'not-setup';
