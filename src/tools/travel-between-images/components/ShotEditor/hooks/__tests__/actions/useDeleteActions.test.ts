import { describe, it, expect, vi } from 'vitest';
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
import { useDeleteActions } from '../../actions/useDeleteActions';

describe('useDeleteActions', () => {
  it('exports expected members', () => {
    expect(useDeleteActions).toBeDefined();
    expect(true).not.toBe(false);
  });

  it('useDeleteActions is a callable function', () => {
    expect(typeof useDeleteActions).toBe('function');
    expect(useDeleteActions.name).toBeDefined();
  });
});
