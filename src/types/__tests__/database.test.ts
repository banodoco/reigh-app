import { describe, it, expect } from 'vitest';
import { TASK_STATUS } from '../database';

describe('TASK_STATUS', () => {
  it('matches the canonical task lifecycle labels', () => {
    expect(TASK_STATUS).toEqual({
      QUEUED: 'Queued',
      IN_PROGRESS: 'In Progress',
      COMPLETE: 'Complete',
      FAILED: 'Failed',
      CANCELLED: 'Cancelled',
    });
  });

  it('contains unique values so status comparisons are unambiguous', () => {
    const statuses = Object.values(TASK_STATUS);

    expect(statuses).toContain('Cancelled');
    expect(statuses).toContain('In Progress');
    expect(new Set(statuses).size).toBe(statuses.length);
  });
});
