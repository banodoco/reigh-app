import { describe, it, expect } from 'vitest';
import TaskDetailsModal from '../TaskDetailsModal';

describe('TaskDetailsModal', () => {
  it('exports expected members', () => {
    expect(TaskDetailsModal).toBeDefined();
    expect(typeof TaskDetailsModal).toBe('function');
  });
});
