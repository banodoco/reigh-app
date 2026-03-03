import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useTasksPaneViewState } from './useTasksPaneViewState';

describe('useTasksPaneViewState', () => {
  it('loads project scope from session storage and updates view state handlers', () => {
    sessionStorage.setItem('tasks-pane-project-scope', 'all');

    const { result } = renderHook(() => useTasksPaneViewState());

    expect(result.current.projectScope).toBe('all');
    expect(result.current.selectedFilter).toBe('Processing');
    expect(result.current.currentPage).toBe(1);

    act(() => {
      result.current.handleFilterChange('Completed');
      result.current.handleTaskTypeChange('join_clips');
      result.current.handlePageChange(3);
      result.current.handleStatusIndicatorClick('Failed');
      result.current.setProjectScope('current');
      result.current.setMobileActiveTaskId('task-1');
    });

    expect(result.current.selectedFilter).toBe('Failed');
    expect(result.current.selectedTaskType).toBe('join_clips');
    expect(result.current.currentPage).toBe(1);
    expect(result.current.projectScope).toBe('current');
    expect(result.current.mobileActiveTaskId).toBe('task-1');
    expect(sessionStorage.getItem('tasks-pane-project-scope')).toBe('current');
  });
});
