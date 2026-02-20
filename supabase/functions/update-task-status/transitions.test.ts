import { describe, expect, it } from 'vitest';

import { allowedTransitions, isTaskStatus, isTransitionAllowed } from './transitions.ts';

describe('update-task-status transitions', () => {
  it('recognizes valid status values', () => {
    expect(isTaskStatus('Queued')).toBe(true);
    expect(isTaskStatus('In Progress')).toBe(true);
    expect(isTaskStatus('Complete')).toBe(true);
    expect(isTaskStatus('Failed')).toBe(true);
    expect(isTaskStatus('Cancelled')).toBe(true);
  });

  it('rejects invalid status values', () => {
    expect(isTaskStatus('pending')).toBe(false);
    expect(isTaskStatus('')).toBe(false);
    expect(isTaskStatus(null)).toBe(false);
    expect(isTaskStatus(undefined)).toBe(false);
  });

  it('enforces transition matrix', () => {
    expect(isTransitionAllowed('Queued', 'In Progress')).toBe(true);
    expect(isTransitionAllowed('In Progress', 'Queued')).toBe(true);
    expect(isTransitionAllowed('Complete', 'Queued')).toBe(false);
    expect(allowedTransitions('Cancelled')).toEqual([]);
  });
});
