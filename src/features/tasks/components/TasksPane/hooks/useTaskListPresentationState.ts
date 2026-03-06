import { useEffect, useRef, useState } from 'react';
import { TaskStatus, Task } from '@/types/tasks';
import { FilterGroup } from '../constants';

interface UseTaskListPresentationStateArgs {
  tasks: Task[];
  activeFilter: FilterGroup;
  filterStatuses: TaskStatus[];
  currentPage: number;
  isLoading: boolean;
}

interface UseTaskListPresentationStateResult {
  newTaskIds: Set<string>;
  isFilterTransitioning: boolean;
}

const NEW_TASK_THRESHOLD_MS = 15000;
const NEW_TASK_FLASH_MS = 3000;
const FILTER_TRANSITION_SETTLE_MS = 300;

export function useTaskListPresentationState({
  tasks,
  activeFilter,
  filterStatuses,
  currentPage,
  isLoading,
}: UseTaskListPresentationStateArgs): UseTaskListPresentationStateResult {
  const [newTaskIds, setNewTaskIds] = useState<Set<string>>(new Set());
  const [isFilterTransitioning, setIsFilterTransitioning] = useState(false);
  const prevTaskIdsRef = useRef<Set<string>>(new Set());
  const prevFilterRef = useRef<FilterGroup>(activeFilter);
  const prevPageRef = useRef<number>(currentPage);
  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (prevFilterRef.current !== activeFilter) {
      setIsFilterTransitioning(true);
      prevFilterRef.current = activeFilter;
    }
  }, [activeFilter]);

  useEffect(() => {
    if (isFilterTransitioning && tasks.length > 0 && !isLoading) {
      setIsFilterTransitioning(false);
      return;
    }

    if (isFilterTransitioning && !isLoading && tasks.length === 0) {
      const timer = setTimeout(() => {
        setIsFilterTransitioning(false);
      }, FILTER_TRANSITION_SETTLE_MS);
      return () => clearTimeout(timer);
    }
  }, [isFilterTransitioning, isLoading, tasks.length]);

  useEffect(() => {
    if (tasks.length === 0) {
      return;
    }

    const currentIds = new Set(tasks.map((task) => task.id));
    const isPaginationChange = prevPageRef.current !== currentPage;

    if (!hasInitializedRef.current || isPaginationChange) {
      prevTaskIdsRef.current = currentIds;
      prevPageRef.current = currentPage;
      hasInitializedRef.current = true;
      return;
    }

    const now = Date.now();
    const newlyAddedIds = tasks
      .filter((task) => {
        if (prevTaskIdsRef.current.has(task.id) || !task.createdAt) {
          return false;
        }
        const createdTime = new Date(task.createdAt).getTime();
        return now - createdTime < NEW_TASK_THRESHOLD_MS;
      })
      .map((task) => task.id);

    if (newlyAddedIds.length > 0) {
      setNewTaskIds(new Set(newlyAddedIds));
      const timer = setTimeout(() => setNewTaskIds(new Set()), NEW_TASK_FLASH_MS);
      prevTaskIdsRef.current = currentIds;
      return () => clearTimeout(timer);
    }

    prevTaskIdsRef.current = currentIds;
  }, [currentPage, tasks]);

  useEffect(() => {
    prevTaskIdsRef.current = new Set();
    prevPageRef.current = currentPage;
    hasInitializedRef.current = false;
  }, [currentPage, filterStatuses]);

  return {
    newTaskIds,
    isFilterTransitioning,
  };
}
