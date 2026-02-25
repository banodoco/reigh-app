import type { Json } from '@/integrations/supabase/types';
import type { Task } from '@/types/tasks';

export interface TaskDbRow {
  id: string;
  task_type: string;
  params: Json | null;
  status: Task['status'];
  dependant_on?: string[] | null;
  output_location?: string | null;
  created_at: string;
  updated_at?: string | null;
  project_id: string;
  cost_cents?: number | null;
  generation_started_at?: string | null;
  generation_processed_at?: string | null;
  error_message?: string | null;
}

function isStringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isStringArrayOrNull(value: unknown): value is string[] | null {
  return value === null || (Array.isArray(value) && value.every((item) => typeof item === 'string'));
}

export function isTaskDbRow(value: unknown): value is TaskDbRow {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const row = value as Record<string, unknown>;

  if (
    typeof row.id !== 'string'
    || typeof row.task_type !== 'string'
    || typeof row.status !== 'string'
    || typeof row.created_at !== 'string'
    || typeof row.project_id !== 'string'
  ) {
    return false;
  }

  if (row.updated_at !== undefined && !isStringOrNull(row.updated_at)) return false;
  if (row.output_location !== undefined && !isStringOrNull(row.output_location)) return false;
  if (row.error_message !== undefined && !isStringOrNull(row.error_message)) return false;
  if (row.generation_started_at !== undefined && !isStringOrNull(row.generation_started_at)) return false;
  if (row.generation_processed_at !== undefined && !isStringOrNull(row.generation_processed_at)) return false;
  if (row.cost_cents !== undefined && row.cost_cents !== null && typeof row.cost_cents !== 'number') return false;
  if (row.dependant_on !== undefined && !isStringArrayOrNull(row.dependant_on)) return false;

  return true;
}

function mapTaskParams(params: Json | null): Record<string, unknown> {
  return (params && typeof params === 'object' && !Array.isArray(params))
    ? (params as Record<string, unknown>)
    : {};
}

export function mapTaskDbRowToTask(row: TaskDbRow): Task {
  return {
    id: row.id,
    taskType: row.task_type,
    params: mapTaskParams(row.params),
    status: row.status,
    dependantOn: row.dependant_on ?? undefined,
    outputLocation: row.output_location ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? undefined,
    projectId: row.project_id,
    costCents: row.cost_cents ?? undefined,
    generationStartedAt: row.generation_started_at ?? undefined,
    generationProcessedAt: row.generation_processed_at ?? undefined,
    errorMessage: row.error_message ?? undefined,
  };
}
