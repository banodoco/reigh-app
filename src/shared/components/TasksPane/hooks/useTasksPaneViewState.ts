import { useEffect, useState } from 'react';
import type { FilterGroup } from '../constants';

const PROJECT_SCOPE_SESSION_KEY = 'tasks-pane-project-scope';

interface UseTasksPaneViewStateResult {
  selectedFilter: FilterGroup;
  selectedTaskType: string | null;
  projectScope: string;
  currentPage: number;
  mobileActiveTaskId: string | null;
  setProjectScope: (scope: string) => void;
  setMobileActiveTaskId: (taskId: string | null) => void;
  handleFilterChange: (filter: FilterGroup) => void;
  handleTaskTypeChange: (taskType: string | null) => void;
  handlePageChange: (page: number) => void;
  handleStatusIndicatorClick: (type: FilterGroup) => void;
}

export function useTasksPaneViewState(): UseTasksPaneViewStateResult {
  const [selectedFilter, setSelectedFilter] = useState<FilterGroup>('Processing');
  const [selectedTaskType, setSelectedTaskType] = useState<string | null>(null);
  const [projectScope, setProjectScope] = useState<string>(() => {
    try {
      const stored = sessionStorage.getItem(PROJECT_SCOPE_SESSION_KEY);
      return stored || 'current';
    } catch {
      return 'current';
    }
  });
  const [currentPage, setCurrentPage] = useState(1);
  const [mobileActiveTaskId, setMobileActiveTaskId] = useState<string | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(PROJECT_SCOPE_SESSION_KEY, projectScope);
    } catch {
      // Session storage may be unavailable in restricted environments.
    }
  }, [projectScope]);

  const handleFilterChange = (filter: FilterGroup) => {
    setSelectedFilter(filter);
    setCurrentPage(1);
    setMobileActiveTaskId(null);
  };

  const handleTaskTypeChange = (taskType: string | null) => {
    setSelectedTaskType(taskType);
    setCurrentPage(1);
    setMobileActiveTaskId(null);
  };

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    setMobileActiveTaskId(null);
  };

  const handleStatusIndicatorClick = (type: FilterGroup) => {
    setSelectedFilter(type);
    setCurrentPage(1);
  };

  return {
    selectedFilter,
    selectedTaskType,
    projectScope,
    currentPage,
    mobileActiveTaskId,
    setProjectScope,
    setMobileActiveTaskId,
    handleFilterChange,
    handleTaskTypeChange,
    handlePageChange,
    handleStatusIndicatorClick,
  };
}
