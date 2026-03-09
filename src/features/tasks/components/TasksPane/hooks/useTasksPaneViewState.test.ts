import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTasksPaneViewState } from './useTasksPaneViewState';

const SESSION_KEY = 'tasks-pane-project-scope';

describe('useTasksPaneViewState', () => {
  let getItemSpy: ReturnType<typeof vi.spyOn>;
  let setItemSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('initializes scope from session storage and persists scope changes', () => {
    getItemSpy.mockReturnValue('all');

    const { result } = renderHook(() => useTasksPaneViewState());

    expect(result.current.projectScope).toBe('all');
    expect(setItemSpy).toHaveBeenCalledWith(SESSION_KEY, 'all');

    act(() => {
      result.current.setProjectScope('project-2');
    });

    expect(result.current.projectScope).toBe('project-2');
    expect(setItemSpy).toHaveBeenCalledWith(SESSION_KEY, 'project-2');
  });

  it('falls back safely when session storage is unavailable', () => {
    getItemSpy.mockImplementation(() => {
      throw new Error('blocked');
    });
    setItemSpy.mockImplementation(() => {
      throw new Error('blocked');
    });

    const { result } = renderHook(() => useTasksPaneViewState());

    expect(result.current.projectScope).toBe('current');

    act(() => {
      result.current.setProjectScope('all');
    });

    expect(result.current.projectScope).toBe('all');
  });

  it('resets pagination/mobile state for filter and task type changes', () => {
    const { result } = renderHook(() => useTasksPaneViewState());

    act(() => {
      result.current.setMobileActiveTaskId('task-1');
      result.current.handlePageChange(3);
    });
    expect(result.current.currentPage).toBe(3);
    expect(result.current.mobileActiveTaskId).toBeNull();

    act(() => {
      result.current.setMobileActiveTaskId('task-2');
      result.current.handleFilterChange('Failed');
    });
    expect(result.current.selectedFilter).toBe('Failed');
    expect(result.current.currentPage).toBe(1);
    expect(result.current.mobileActiveTaskId).toBeNull();

    act(() => {
      result.current.setMobileActiveTaskId('task-3');
      result.current.handleTaskTypeChange('image_generation');
    });
    expect(result.current.selectedTaskType).toBe('image_generation');
    expect(result.current.currentPage).toBe(1);
    expect(result.current.mobileActiveTaskId).toBeNull();

    act(() => {
      result.current.setMobileActiveTaskId('task-4');
      result.current.handleStatusIndicatorClick('Succeeded');
    });
    expect(result.current.selectedFilter).toBe('Succeeded');
    expect(result.current.currentPage).toBe(1);
    expect(result.current.mobileActiveTaskId).toBe('task-4');
  });
});
