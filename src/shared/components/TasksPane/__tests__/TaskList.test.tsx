import { describe, it, expect, vi } from 'vitest';
vi.mock('@/shared/contexts/ProjectContext', () => ({ useProject: vi.fn(() => ({ selectedProjectId: 'test' })) }));
import TaskList from '../TaskList';

describe('TaskList', () => {
  it('exports a component', () => {
    expect(TaskList).toBeDefined();
    expect(typeof TaskList === 'function' || typeof TaskList === 'object').toBe(true);
  });
});
