import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTaskLogFilters } from './useTaskLogFilters';

describe('useTaskLogFilters', () => {
  it('updates and clears filters while resetting page', () => {
    const { result } = renderHook(() => useTaskLogFilters());

    act(() => {
      result.current.setPage(3);
      result.current.updateFilter('costFilter', 'paid');
      result.current.toggleArrayFilter('taskTypes', 'generation');
      result.current.toggleArrayFilter('projectIds', 'project-1');
    });

    expect(result.current.page).toBe(1);
    expect(result.current.filters.costFilter).toBe('paid');
    expect(result.current.filters.taskTypes).toEqual(['generation']);
    expect(result.current.filters.projectIds).toEqual(['project-1']);
    expect(result.current.getFilterCount()).toBe(4);

    act(() => {
      result.current.clearFilters();
    });

    expect(result.current.page).toBe(1);
    expect(result.current.filters).toEqual({
      costFilter: 'all',
      status: ['Complete'],
      taskTypes: [],
      projectIds: [],
    });
  });
});
