export type GenerationTaskIdParseStatus = 'ok' | 'invalid_tasks_shape';

export interface GenerationTaskIdParseResult {
  taskId: string | null;
  status: GenerationTaskIdParseStatus;
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
    return { taskId: tasks, status: 'ok' };
  }

  if (!Array.isArray(tasks)) {
    return { taskId: null, status: 'invalid_tasks_shape' };
  }

  if (!tasks.every((item) => typeof item === 'string')) {
    return { taskId: null, status: 'invalid_tasks_shape' };
  }

  return { taskId: tasks.length > 0 ? tasks[0] : null, status: 'ok' };
}
