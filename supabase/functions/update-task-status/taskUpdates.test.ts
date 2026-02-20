import { describe, expect, it } from 'vitest';
import { fetchCurrentTaskStatus, updateTaskByRole } from './taskUpdates.ts';

describe('update-task-status/taskUpdates exports', () => {
  it('exports task update helpers', () => {
    expect(fetchCurrentTaskStatus).toBeTypeOf('function');
    expect(updateTaskByRole).toBeTypeOf('function');
  });
});
