import { describe, it, expect } from 'vitest';
import TaskDetailsPanel from '../TaskDetails/TaskDetailsPanel';

describe('TaskDetailsPanel', () => {
  it('exports expected members', () => {
    expect(TaskDetailsPanel).toBeDefined();
    expect(typeof TaskDetailsPanel).toBe('function');
  });
});
