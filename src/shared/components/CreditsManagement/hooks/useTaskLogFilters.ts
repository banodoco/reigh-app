import { useState, useCallback } from 'react';
import type { TaskLogFilters } from '../types';

const DEFAULT_FILTERS: TaskLogFilters = {
  costFilter: 'all',
  status: ['Complete'],
  taskTypes: [],
  projectIds: [],
};

interface UseTaskLogFiltersReturn {
  filters: TaskLogFilters;
  page: number;
  setPage: (page: number) => void;
  updateFilter: <K extends keyof TaskLogFilters>(filterType: K, value: TaskLogFilters[K]) => void;
  toggleArrayFilter: (filterType: 'status' | 'taskTypes' | 'projectIds', value: string) => void;
  clearFilters: () => void;
  getFilterCount: () => number;
}

export function useTaskLogFilters(): UseTaskLogFiltersReturn {
  const [filters, setFilters] = useState<TaskLogFilters>(DEFAULT_FILTERS);
  const [page, setPage] = useState(1);

  const updateFilter = useCallback(<K extends keyof TaskLogFilters>(
    filterType: K,
    value: TaskLogFilters[K]
  ) => {
    setFilters(prev => ({ ...prev, [filterType]: value }));
    setPage(1);
  }, []);

  const toggleArrayFilter = useCallback((
    filterType: 'status' | 'taskTypes' | 'projectIds',
    value: string
  ) => {
    setFilters(prev => {
      const currentArray = prev[filterType];
      const newArray = currentArray.includes(value)
        ? currentArray.filter(item => item !== value)
        : [...currentArray, value];
      return { ...prev, [filterType]: newArray };
    });
    setPage(1);
  }, []);

  const clearFilters = useCallback(() => {
    setFilters(DEFAULT_FILTERS);
    setPage(1);
  }, []);

  const getFilterCount = useCallback(() => {
    let count = 0;
    if (filters.costFilter !== 'all') count++;
    if (filters.status.length > 0) count++;
    if (filters.taskTypes.length > 0) count++;
    if (filters.projectIds.length > 0) count++;
    return count;
  }, [filters]);

  return {
    filters,
    page,
    setPage,
    updateFilter,
    toggleArrayFilter,
    clearFilters,
    getFilterCount,
  };
}
