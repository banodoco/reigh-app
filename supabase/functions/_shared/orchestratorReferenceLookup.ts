import {
  buildLegacyOrchestratorRefOrFilter,
  buildLegacyOrchestratorRunOrFilter,
  buildOrchestratorRefOrFilter,
  buildOrchestratorRunOrFilter,
} from './orchestratorReference.ts';

interface TaskLookupResponse {
  data: unknown[] | null;
  error: unknown;
}

interface TaskLookupBuilder extends PromiseLike<TaskLookupResponse> {
  eq(column: string, value: string): TaskLookupBuilder;
  or(filter: string): TaskLookupBuilder;
}

interface TaskLookupClient {
  from(table: string): {
    select(columns: string): TaskLookupBuilder;
  };
}

interface LookupByRunIdInput {
  supabase: TaskLookupClient;
  taskType: string;
  projectId: string;
  select: string;
  runId: string;
  contextLabel: string;
}

interface LookupByOrchestratorIdInput {
  supabase: TaskLookupClient;
  taskType: string;
  projectId: string;
  select: string;
  orchestratorTaskId: string;
  contextLabel: string;
}

export async function lookupTasksByRunIdWithFallback<Row = Record<string, unknown>>(
  input: LookupByRunIdInput,
): Promise<Row[]> {
  const {
    supabase,
    taskType,
    projectId,
    select,
    runId,
    contextLabel,
  } = input;

  const canonicalResult = await supabase
    .from("tasks")
    .select(select)
    .eq("task_type", taskType)
    .eq("project_id", projectId)
    .or(buildOrchestratorRunOrFilter(runId));

  if (canonicalResult.error) {
    throw new Error(
      `[${contextLabel}] Error querying tasks by contract run_id: ${
        canonicalResult.error instanceof Error
          ? canonicalResult.error.message
          : String(canonicalResult.error)
      }`,
    );
  }

  const canonicalRows = (canonicalResult.data ?? []) as Row[];
  if (canonicalRows.length > 0) {
    return canonicalRows;
  }

  const legacyResult = await supabase
    .from("tasks")
    .select(select)
    .eq("task_type", taskType)
    .eq("project_id", projectId)
    .or(buildLegacyOrchestratorRunOrFilter(runId));

  if (legacyResult.error) {
    throw new Error(
      `[${contextLabel}] Error querying tasks by legacy run_id fallback: ${
        legacyResult.error instanceof Error
          ? legacyResult.error.message
          : String(legacyResult.error)
      }`,
    );
  }

  const legacyRows = (legacyResult.data ?? []) as Row[];
  if (legacyRows.length > 0) {
    console.warn(`[${contextLabel}] Legacy run_id fallback matched tasks`, {
      taskType,
      projectId,
      runId,
      count: legacyRows.length,
    });
    return legacyRows;
  }

  return [];
}

export async function lookupTasksByOrchestratorIdWithFallback<Row = Record<string, unknown>>(
  input: LookupByOrchestratorIdInput,
): Promise<Row[]> {
  const {
    supabase,
    taskType,
    projectId,
    select,
    orchestratorTaskId,
    contextLabel,
  } = input;

  const canonicalResult = await supabase
    .from("tasks")
    .select(select)
    .eq("task_type", taskType)
    .eq("project_id", projectId)
    .or(buildOrchestratorRefOrFilter(orchestratorTaskId));

  if (canonicalResult.error) {
    throw new Error(
      `[${contextLabel}] Error querying tasks by contract orchestrator ref: ${
        canonicalResult.error instanceof Error
          ? canonicalResult.error.message
          : String(canonicalResult.error)
      }`,
    );
  }

  const canonicalRows = (canonicalResult.data ?? []) as Row[];
  if (canonicalRows.length > 0) {
    return canonicalRows;
  }

  const legacyResult = await supabase
    .from("tasks")
    .select(select)
    .eq("task_type", taskType)
    .eq("project_id", projectId)
    .or(buildLegacyOrchestratorRefOrFilter(orchestratorTaskId));

  if (legacyResult.error) {
    throw new Error(
      `[${contextLabel}] Error querying tasks by legacy orchestrator fallback: ${
        legacyResult.error instanceof Error
          ? legacyResult.error.message
          : String(legacyResult.error)
      }`,
    );
  }

  const legacyRows = (legacyResult.data ?? []) as Row[];
  if (legacyRows.length > 0) {
    console.warn(`[${contextLabel}] Legacy orchestrator reference fallback matched tasks`, {
      taskType,
      projectId,
      orchestratorTaskId,
      count: legacyRows.length,
    });
    return legacyRows;
  }

  return [];
}
