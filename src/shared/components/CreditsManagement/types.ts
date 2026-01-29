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

export type AutoTopupState =
  | 'loading'
  | 'active'
  | 'setup-but-disabled'
  | 'enabled-but-not-setup'
  | 'not-setup';
