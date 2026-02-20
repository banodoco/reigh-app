import { describe, expect, it } from 'vitest';
import type { AutoTopupState, CreditsManagementProps, TaskLogFilters } from './types';

describe('CreditsManagement types', () => {
  it('accepts valid shape contracts', () => {
    const filters: TaskLogFilters = {
      costFilter: 'all',
      status: ['Complete'],
      taskTypes: [],
      projectIds: [],
    };

    const props: CreditsManagementProps = {
      initialTab: 'task-log',
      mode: 'all',
    };

    const state: AutoTopupState = 'active';

    expect(filters.status[0]).toBe('Complete');
    expect(props.mode).toBe('all');
    expect(state).toBe('active');
  });
});
