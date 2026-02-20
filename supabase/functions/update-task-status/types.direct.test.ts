import { describe, expect, it } from 'vitest';
import type { TaskStatus, TaskStatusRow, UpdateTaskStatusRequest } from './types.ts';
import { VALID_TASK_STATUSES } from './types.ts';

describe('update-task-status types direct coverage', () => {
  it('exposes task status contract', () => {
    const status: TaskStatus = 'Complete';
    const request: UpdateTaskStatusRequest = {
      task_id: 'task-1',
      status,
      clear_worker: true,
    };
    const row: TaskStatusRow = {
      id: 'task-1',
      status,
      params: {},
    };

    expect(VALID_TASK_STATUSES).toContain('Complete');
    expect(request.status).toBe('Complete');
    expect(row.status).toBe('Complete');
  });
});
