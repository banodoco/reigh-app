interface ParsedCreateTaskBody {
  task_id?: string;
  params: Record<string, unknown>;
  task_type: string;
  project_id?: string;
  normalizedDependantOn: string[] | null;
  idempotency_key?: string;
}

interface TaskInsertObject {
  id?: string;
  params: Record<string, unknown>;
  task_type: string;
  project_id: string;
  dependant_on: string[] | null;
  status: 'Queued';
  created_at: string;
  idempotency_key?: string;
}

interface ParseSuccess {
  ok: true;
  value: ParsedCreateTaskBody;
}

interface ParseFailure {
  ok: false;
  error: string;
}

type ParseResult = ParseSuccess | ParseFailure;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function normalizeDependantOn(value: unknown): string[] | null {
  if (Array.isArray(value)) {
    const normalized = value
      .map(asNonEmptyString)
      .filter((entry): entry is string => entry !== null);
    return normalized.length > 0 ? normalized : null;
  }

  const one = asNonEmptyString(value);
  return one ? [one] : null;
}

export function parseCreateTaskBody(body: unknown): ParseResult {
  if (!isRecord(body)) {
    return { ok: false, error: 'Invalid JSON body' };
  }

  const params = body.params;
  const taskType = asNonEmptyString(body.task_type);

  if (!isRecord(params) || !taskType) {
    return { ok: false, error: 'params, task_type required' };
  }

  const taskId = body.task_id === undefined ? undefined : asNonEmptyString(body.task_id);
  if (body.task_id !== undefined && taskId === null) {
    return { ok: false, error: 'task_id must be a non-empty string when provided' };
  }

  const projectId = body.project_id === undefined ? undefined : asNonEmptyString(body.project_id);
  if (body.project_id !== undefined && projectId === null) {
    return { ok: false, error: 'project_id must be a non-empty string when provided' };
  }

  const idempotencyKey = body.idempotency_key === undefined
    ? undefined
    : asNonEmptyString(body.idempotency_key);
  if (body.idempotency_key !== undefined && idempotencyKey === null) {
    return { ok: false, error: 'idempotency_key must be a non-empty string when provided' };
  }

  return {
    ok: true,
    value: {
      task_id: taskId,
      params,
      task_type: taskType,
      project_id: projectId,
      normalizedDependantOn: normalizeDependantOn(body.dependant_on),
      idempotency_key: idempotencyKey,
    },
  };
}

interface BuildTaskInsertObjectParams {
  request: ParsedCreateTaskBody;
  finalProjectId: string;
  now?: Date;
}

export function buildTaskInsertObject({
  request,
  finalProjectId,
  now = new Date(),
}: BuildTaskInsertObjectParams): TaskInsertObject {
  const insertObject: TaskInsertObject = {
    params: request.params,
    task_type: request.task_type,
    project_id: finalProjectId,
    dependant_on: request.normalizedDependantOn,
    status: 'Queued',
    created_at: now.toISOString(),
  };

  if (request.task_id) {
    insertObject.id = request.task_id;
  }

  if (request.idempotency_key) {
    insertObject.idempotency_key = request.idempotency_key;
  }

  return insertObject;
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.length > 0) return error;
  return 'Unknown error';
}
