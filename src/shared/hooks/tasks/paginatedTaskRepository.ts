import { Task, TaskStatus } from '@/types/tasks';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { filterVisibleTasks } from '@/shared/lib/taskConfig';
import { TaskDbRow, mapTaskDbRowToTask } from '@/shared/lib/taskRowMapper';
import {
  isProcessingStatusFilter,
  isSucceededOnlyStatus,
  sortProcessingTasks,
} from '@/shared/hooks/tasks/taskFetchPolicy';

// Pagination configuration constants
const PAGINATION_CONFIG = {
  PROCESSING_FETCH_MULTIPLIER: 2,
  PROCESSING_MAX_FETCH: 100,
  DEFAULT_LIMIT: 50,
} as const;

export interface PaginatedTaskQuery {
  allProjects?: boolean;
  allProjectIds?: string[];
  effectiveProjectId: string | null;
  status?: TaskStatus[];
  taskType?: string | null;
  visibleTaskTypes: string[];
  limit: number;
  offset: number;
  page: number;
}

export interface PaginatedTasksResponse {
  tasks: Task[];
  total: number;
  hasMore: boolean;
  totalPages: number;
}

export const EMPTY_PAGINATED_TASKS_RESPONSE: PaginatedTasksResponse = {
  tasks: [],
  total: 0,
  hasMore: false,
  totalPages: 0,
};

export const mapDbTaskToTask = (row: TaskDbRow): Task => mapTaskDbRowToTask(row);

function buildCountQuery(filters: PaginatedTaskQuery) {
  const supabase = getSupabaseClient();
  let query = supabase
    .from('tasks')
    .select('*', { count: 'exact', head: true })
    .is('params->orchestrator_task_id_ref', null)
    .in('task_type', filters.visibleTaskTypes);

  if (filters.allProjects && filters.allProjectIds) {
    query = query.in('project_id', filters.allProjectIds);
  } else if (filters.effectiveProjectId) {
    query = query.eq('project_id', filters.effectiveProjectId);
  }

  if (filters.status?.length) {
    query = query.in('status', filters.status);
  }

  if (filters.taskType) {
    query = query.eq('task_type', filters.taskType);
  }

  return query;
}

function buildDataQuery(filters: PaginatedTaskQuery) {
  const supabase = getSupabaseClient();
  const needsCustomSorting = isProcessingStatusFilter(filters.status);
  const succeededOnly = isSucceededOnlyStatus(filters.status);

  let query = supabase
    .from('tasks')
    .select('*')
    .is('params->orchestrator_task_id_ref', null)
    .in('task_type', filters.visibleTaskTypes);

  if (filters.allProjects && filters.allProjectIds) {
    query = query.in('project_id', filters.allProjectIds);
  } else if (filters.effectiveProjectId) {
    query = query.eq('project_id', filters.effectiveProjectId);
  }

  if (succeededOnly) {
    query = query
      .order('generation_processed_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }

  if (filters.status?.length) {
    query = query.in('status', filters.status);
  }

  if (filters.taskType) {
    query = query.eq('task_type', filters.taskType);
  }

  if (needsCustomSorting) {
    const effectiveBaseLimit = Math.max(filters.limit, PAGINATION_CONFIG.DEFAULT_LIMIT);
    const fetchLimit = filters.page === 1
      ? Math.min(
        effectiveBaseLimit * PAGINATION_CONFIG.PROCESSING_FETCH_MULTIPLIER,
        PAGINATION_CONFIG.PROCESSING_MAX_FETCH,
      )
      : effectiveBaseLimit;

    return query.limit(fetchLimit);
  }

  return query.range(filters.offset, filters.offset + filters.limit - 1);
}

function buildPaginatedTasksResponse(
  visibleTasks: Task[],
  needsCustomSorting: boolean,
  count: number | null,
  offset: number,
  limit: number,
): PaginatedTasksResponse {
  const paginatedTasks = needsCustomSorting
    ? sortProcessingTasks(visibleTasks).slice(offset, offset + limit)
    : visibleTasks;
  const total = count !== null ? count : Math.max(paginatedTasks.length, offset + paginatedTasks.length);
  const totalPages = Math.ceil(total / limit);
  const hasMore = count !== null ? offset + limit < total : paginatedTasks.length >= limit;

  return {
    tasks: paginatedTasks,
    total,
    hasMore,
    totalPages,
  };
}

export async function fetchPaginatedTasks(filters: PaginatedTaskQuery): Promise<PaginatedTasksResponse> {
  if (filters.allProjects && (!filters.allProjectIds || filters.allProjectIds.length === 0)) {
    return EMPTY_PAGINATED_TASKS_RESPONSE;
  }
  if (!filters.allProjects && !filters.effectiveProjectId) {
    return EMPTY_PAGINATED_TASKS_RESPONSE;
  }

  const needsCustomSorting = isProcessingStatusFilter(filters.status);
  const [countResult, { data, error: dataError }] = await Promise.all([
    buildCountQuery(filters),
    buildDataQuery(filters),
  ]);
  const { count, error: countError } = countResult;

  if (countError) {
    throw countError;
  }
  if (dataError) {
    throw dataError;
  }

  const allTasks = (data || []).map(mapDbTaskToTask);
  const visibleTasks = filterVisibleTasks(allTasks);

  return buildPaginatedTasksResponse(
    visibleTasks,
    needsCustomSorting,
    count,
    filters.offset,
    filters.limit,
  );
}
