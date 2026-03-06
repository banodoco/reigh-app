import { useEffect, useMemo, useState } from 'react';
import { usePaginatedTasks, type PaginatedTasksResponse } from '@/shared/hooks/tasks/useTasks';
import { useAllTaskTypes, useTaskStatusCounts } from '@/shared/hooks/tasks/useTaskStatusCounts';
import { getTaskDisplayName } from '@/shared/lib/taskConfig';
import { ITEMS_PER_PAGE, STATUS_GROUPS, type FilterGroup } from '../constants';
import { useTasksPaneViewState } from './useTasksPaneViewState';
import { useTasksPaneCancelPending } from './useTasksPaneCancelPending';

interface TasksPaneProject {
  id: string;
  name: string;
}

interface IncomingTaskForCount {
  taskIds?: string[];
  expectedCount?: number;
}

interface UseTasksPaneControllerInput {
  selectedProjectId: string | null | undefined;
  projects: TasksPaneProject[];
  incomingTasks: IncomingTaskForCount[];
  cancelAllIncoming: () => void;
}

interface UseTasksPaneControllerResult {
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
  handleCancelAllPending: () => void;
  isCancelAllPending: boolean;
  paginatedData: PaginatedTasksResponse | undefined;
  isPaginatedLoading: boolean;
  displayStatusCounts: ReturnType<typeof useTaskStatusCounts>['data'];
  isStatusCountsLoading: boolean;
  isStatusCountsDegraded: boolean;
  failedStatusQueries: string | undefined;
  taskTypeOptions: Array<{ value: string; label: string }>;
  totalTasks: number;
  totalPages: number;
  cancellableTaskCount: number;
  effectiveProjectId: string | null;
  isAllProjectsMode: boolean;
  projectNameMap: Record<string, string>;
}

export function useTasksPaneController(
  input: UseTasksPaneControllerInput,
): UseTasksPaneControllerResult {
  const { selectedProjectId, projects, incomingTasks, cancelAllIncoming } = input;
  const viewState = useTasksPaneViewState();

  const {
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
  } = viewState;

  const shouldLoadTasks = Boolean(selectedProjectId);
  const allProjectIds = useMemo(() => projects.map((project) => project.id), [projects]);
  const projectNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    projects.forEach((project) => {
      map[project.id] = project.name;
    });
    return map;
  }, [projects]);

  const effectiveProjectId = projectScope === 'current'
    ? selectedProjectId ?? null
    : projectScope !== 'all'
      ? projectScope
      : null;
  const isAllProjectsMode = projectScope === 'all';

  const { data: paginatedData, isLoading: isPaginatedLoading } = usePaginatedTasks({
    projectId: shouldLoadTasks ? effectiveProjectId : null,
    status: STATUS_GROUPS[selectedFilter],
    limit: ITEMS_PER_PAGE,
    offset: (currentPage - 1) * ITEMS_PER_PAGE,
    taskType: selectedTaskType,
    allProjects: isAllProjectsMode,
    allProjectIds: isAllProjectsMode ? allProjectIds : undefined,
  });

  const { data: statusCounts, isLoading: isStatusCountsLoading } = useTaskStatusCounts(
    shouldLoadTasks ? selectedProjectId : null,
  );
  const { data: allTaskTypes } = useAllTaskTypes(shouldLoadTasks ? selectedProjectId : null);

  const taskTypeOptions = useMemo(() => {
    if (!allTaskTypes || allTaskTypes.length === 0) {
      return [];
    }

    return allTaskTypes
      .map((taskType) => ({
        value: taskType,
        label: getTaskDisplayName(taskType),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [allTaskTypes]);

  const [displayStatusCounts, setDisplayStatusCounts] = useState(statusCounts);
  useEffect(() => {
    if ((!isStatusCountsLoading && statusCounts) || (!displayStatusCounts && statusCounts)) {
      setDisplayStatusCounts(statusCounts);
    }
  }, [statusCounts, isStatusCountsLoading, displayStatusCounts]);

  const dbCount = selectedFilter === 'Processing'
    ? (paginatedData?.total || 0)
    : (displayStatusCounts?.processing || 0);

  const cancellableTaskCount = useMemo(() => {
    if (incomingTasks.length === 0) {
      return dbCount;
    }
    const unresolvedCount = incomingTasks
      .filter((task) => !task.taskIds?.length)
      .reduce((sum, task) => sum + (task.expectedCount ?? 1), 0);
    return dbCount + unresolvedCount;
  }, [dbCount, incomingTasks]);

  const { handleCancelAllPending, isCancelAllPending } = useTasksPaneCancelPending({
    selectedProjectId,
    selectedFilter,
    currentPage,
    cancelAllIncoming,
  });

  const totalTasks = paginatedData?.total || 0;
  const totalPages = Math.ceil(totalTasks / ITEMS_PER_PAGE);
  const isStatusCountsDegraded = Boolean(displayStatusCounts?.degraded);
  const failedStatusQueries = displayStatusCounts?.failedQueries?.join(', ');

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
    handleCancelAllPending,
    isCancelAllPending,
    paginatedData,
    isPaginatedLoading,
    displayStatusCounts,
    isStatusCountsLoading,
    isStatusCountsDegraded,
    failedStatusQueries,
    taskTypeOptions,
    totalTasks,
    totalPages,
    cancellableTaskCount,
    effectiveProjectId,
    isAllProjectsMode,
    projectNameMap,
  };
}
