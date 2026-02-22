import { describe, it, expect } from 'vitest';
import TaskDetailsPanel from '../TaskDetailsPanel';

describe('TaskDetailsPanel', () => {
  it('exports expected members', () => {
    expect(TaskDetailsPanel).toBeDefined();
    expect(typeof TaskDetailsPanel).toBe('function');
  });
});
