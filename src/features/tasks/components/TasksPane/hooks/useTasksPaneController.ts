import { useEffect, useMemo, useState } from 'react';
import { usePaginatedTasks, type PaginatedTasksResponse } from '@/shared/hooks/tasks/useTasks';
import { useAllTaskTypes, useTaskStatusCounts } from '@/shared/hooks/tasks/useTaskStatusCounts';
import { getTaskDisplayName } from '@/shared/lib/tasks/taskConfig';
import { operationSuccess } from '@/shared/lib/operationResult';
import type { Task as RuntimeTask } from '@/integrations/runtime/generated.ts';
import { ITEMS_PER_PAGE, STATUS_GROUPS } from '../constants';
import { useTasksPaneViewState, type UseTasksPaneViewStateResult } from './useTasksPaneViewState';
import { useTasksPaneCancelPending } from './useTasksPaneCancelPending';
import {
  runtimeTaskIsCancellable,
  runtimeTaskStatusGroup,
  runtimeTaskType,
  useRuntimeTasks,
} from './useRuntimeTasks';

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
  runtimeProjectId?: string | null;
  projects: TasksPaneProject[];
  incomingTasks: IncomingTaskForCount[];
  cancelAllIncoming: () => void;
}

export interface RuntimeTaskPageData {
  tasks: RuntimeTask[];
  total: number;
  totalPages: number;
}

interface UseTasksPaneControllerResult extends UseTasksPaneViewStateResult {
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
  isRuntimeMode: boolean;
  runtimeTaskData: RuntimeTaskPageData | undefined;
  runtimeTaskError: Error | null;
  runtimeTaskActionError: Error | null;
  runtimeTaskActions: ReturnType<typeof useRuntimeTasks>;
}

export function useTasksPaneController(
  input: UseTasksPaneControllerInput,
): UseTasksPaneControllerResult {
  const {
    selectedProjectId,
    runtimeProjectId = null,
    projects,
    incomingTasks,
    cancelAllIncoming,
  } = input;
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

  const isRuntimeMode = Boolean(runtimeProjectId);
  const runtimeTasks = useRuntimeTasks(runtimeProjectId);
  const shouldLoadTasks = Boolean(selectedProjectId) && !isRuntimeMode;
  const allProjectIds = useMemo(() => projects.map((project) => project.id), [projects]);
  const projectNameMap = useMemo(() => {
    const map: Record<string, string> = {};
    projects.forEach((project) => {
      map[project.id] = project.name;
    });
    return map;
  }, [projects]);

  const legacyEffectiveProjectId = projectScope === 'current'
    ? selectedProjectId ?? null
    : projectScope !== 'all'
      ? projectScope
      : null;
  const isAllProjectsMode = !isRuntimeMode && projectScope === 'all';
  const effectiveProjectId = isRuntimeMode ? runtimeProjectId : legacyEffectiveProjectId;

  const { data: paginatedData, isLoading: isPaginatedLoading } = usePaginatedTasks({
    projectId: shouldLoadTasks ? effectiveProjectId : null,
    status: STATUS_GROUPS[selectedFilter],
    limit: ITEMS_PER_PAGE,
    offset: (currentPage - 1) * ITEMS_PER_PAGE,
    taskType: selectedTaskType,
    allProjects: isAllProjectsMode,
    allProjectIds: isAllProjectsMode ? allProjectIds : undefined,
  });

  const scopedProjectId = shouldLoadTasks
    ? (legacyEffectiveProjectId ?? selectedProjectId ?? null)
    : null;
  const { data: statusCounts, isLoading: isStatusCountsLoading } = useTaskStatusCounts(
    scopedProjectId,
    isAllProjectsMode ? { allProjectIds: allProjectIds } : undefined,
  );
  const { data: allTaskTypes } = useAllTaskTypes(scopedProjectId);

  const legacyTaskTypeOptions = useMemo(() => {
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

  const legacyDbCount = selectedFilter === 'Processing'
    ? (paginatedData?.total || 0)
    : (displayStatusCounts?.processing || 0);

  const legacyCancellableTaskCount = useMemo(() => {
    if (incomingTasks.length === 0) {
      return legacyDbCount;
    }
    const unresolvedCount = incomingTasks
      .filter((task) => !task.taskIds?.length)
      .reduce((sum, task) => sum + (task.expectedCount ?? 1), 0);
    return legacyDbCount + unresolvedCount;
  }, [incomingTasks, legacyDbCount]);

  const legacyCancelPending = useTasksPaneCancelPending({
    selectedProjectId: isRuntimeMode ? null : selectedProjectId,
    selectedFilter,
    currentPage,
    cancelAllIncoming: isRuntimeMode ? () => {} : cancelAllIncoming,
  });

  const runtimeTaskData = useMemo<RuntimeTaskPageData | undefined>(() => {
    if (!isRuntimeMode || !runtimeTasks.data) return undefined;

    const filtered = runtimeTasks.data
      .filter((task) => runtimeTaskStatusGroup(task) === selectedFilter)
      .filter((task) => !selectedTaskType || runtimeTaskType(task) === selectedTaskType)
      .sort((left, right) => new Date(right.updated_at || right.created_at).getTime()
        - new Date(left.updated_at || left.created_at).getTime());
    const totalPages = filtered.length === 0 ? 0 : Math.ceil(filtered.length / ITEMS_PER_PAGE);
    return {
      tasks: filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
      total: filtered.length,
      totalPages,
    };
  }, [currentPage, isRuntimeMode, runtimeTasks.data, selectedFilter, selectedTaskType]);

  const runtimeStatusCounts = useMemo(() => {
    if (!isRuntimeMode || !runtimeTasks.data) return undefined;
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const processing = runtimeTasks.data.filter(runtimeTaskIsCancellable).length;
    const recentSuccesses = runtimeTasks.data.filter((task) =>
      task.state === 'succeeded' && new Date(task.updated_at || task.created_at).getTime() >= oneHourAgo,
    ).length;
    const recentFailures = runtimeTasks.data.filter((task) =>
      (task.state === 'failed' || task.state === 'cancelled')
      && new Date(task.updated_at || task.created_at).getTime() >= oneHourAgo,
    ).length;
    return {
      processing,
      recentSuccesses,
      recentFailures,
      degraded: false,
      failedQueries: [],
      operation: operationSuccess({ processing, recentSuccesses, recentFailures }, { policy: 'best_effort' }),
    };
  }, [isRuntimeMode, runtimeTasks.data]);

  const runtimeTaskTypeOptions = useMemo(() => {
    if (!isRuntimeMode) return [];
    return [...new Set((runtimeTasks.data ?? []).map(runtimeTaskType))]
      .sort((left, right) => left.localeCompare(right))
      .map((value) => ({ value, label: value }));
  }, [isRuntimeMode, runtimeTasks.data]);

  const handleCancelAllPending = isRuntimeMode
    ? runtimeTasks.cancelAllPending
    : legacyCancelPending.handleCancelAllPending;
  const isCancelAllPending = isRuntimeMode
    ? runtimeTasks.isCancelAllPending
    : legacyCancelPending.isCancelAllPending;

  const totalTasks = isRuntimeMode ? (runtimeTaskData?.total || 0) : (paginatedData?.total || 0);
  const totalPages = Math.ceil(totalTasks / ITEMS_PER_PAGE);
  const isStatusCountsDegraded = isRuntimeMode ? false : Boolean(displayStatusCounts?.degraded);
  const failedStatusQueries = isRuntimeMode ? undefined : displayStatusCounts?.failedQueries?.join(', ');

  return {
    selectedFilter,
    selectedTaskType,
    projectScope: isRuntimeMode ? 'current' : projectScope,
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
    paginatedData: isRuntimeMode ? undefined : paginatedData,
    isPaginatedLoading: isRuntimeMode ? runtimeTasks.isLoading : isPaginatedLoading,
    displayStatusCounts: isRuntimeMode ? runtimeStatusCounts : displayStatusCounts,
    isStatusCountsLoading: isRuntimeMode ? runtimeTasks.isLoading : isStatusCountsLoading,
    isStatusCountsDegraded,
    failedStatusQueries,
    taskTypeOptions: isRuntimeMode ? runtimeTaskTypeOptions : legacyTaskTypeOptions,
    totalTasks,
    totalPages,
    cancellableTaskCount: isRuntimeMode
      ? (runtimeTasks.data ?? []).filter(runtimeTaskIsCancellable).length
      : legacyCancellableTaskCount,
    effectiveProjectId,
    isAllProjectsMode,
    projectNameMap: isRuntimeMode && runtimeProjectId
      ? { [runtimeProjectId]: 'Runtime project' }
      : projectNameMap,
    isRuntimeMode,
    runtimeTaskData,
    runtimeTaskError: runtimeTasks.error ?? null,
    runtimeTaskActionError: runtimeTasks.actionError ?? null,
    runtimeTaskActions: runtimeTasks,
  };
}
