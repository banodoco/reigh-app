export type GenerationTaskIdParseStatus = 'ok' | 'invalid_tasks_shape';

export interface GenerationTaskIdParseResult {
  taskId: string | null;
  status: GenerationTaskIdParseStatus;
}

function normalizeCandidateTaskId(taskId: string): string | null {
  const normalized = taskId.trim();
  return normalized.length > 0 ? normalized : null;
}

/**
 * Parse `generations.tasks` into a canonical primary task ID representation.
 * Supports legacy `string` and canonical `string[]` storage shapes.
 */
export function parseGenerationTaskId(tasks: unknown): GenerationTaskIdParseResult {
  if (tasks === null || tasks === undefined) {
    return { taskId: null, status: 'ok' };
  }

  if (typeof tasks === 'string') {
    const parsedTaskId = normalizeCandidateTaskId(tasks);
    return parsedTaskId
      ? { taskId: parsedTaskId, status: 'ok' }
      : { taskId: null, status: 'invalid_tasks_shape' };
  }

  if (!Array.isArray(tasks)) {
    return { taskId: null, status: 'invalid_tasks_shape' };
  }

  if (!tasks.every((item) => typeof item === 'string')) {
    return { taskId: null, status: 'invalid_tasks_shape' };
  }

  if (tasks.length === 0) {
    return { taskId: null, status: 'ok' };
  }

  const parsedTaskId = normalizeCandidateTaskId(tasks[0]);
  return parsedTaskId
    ? { taskId: parsedTaskId, status: 'ok' }
    : { taskId: null, status: 'invalid_tasks_shape' };
}
