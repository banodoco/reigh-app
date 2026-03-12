import { ServerError } from '@/shared/lib/errorHandling/errors';

type RepositoryErrorCode = 'query_failed' | 'invalid_row_shape';

interface RepositoryErrorOptions {
  cause?: unknown;
  context?: Record<string, unknown>;
}

function toError(cause: unknown): Error | undefined {
  if (cause instanceof Error) {
    return cause;
  }
  if (cause == null) {
    return undefined;
  }
  return new Error(typeof cause === 'string' ? cause : JSON.stringify(cause));
}

export class RepositoryError extends ServerError {
  readonly code: RepositoryErrorCode;

  constructor(
    code: RepositoryErrorCode,
    message: string,
    options: RepositoryErrorOptions = {},
  ) {
    super(message, {
      cause: toError(options.cause),
      context: options.context,
    });
    this.name = 'RepositoryError';
    this.code = code;
  }
}

export function isRepositoryNoRowsError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === 'PGRST116') {
    return true;
  }
  return typeof candidate.message === 'string' && /0 rows/i.test(candidate.message);
}

export function createRepositoryQueryError(
  entityName: string,
  cause: unknown,
  context: Record<string, unknown>,
): RepositoryError {
  const message = cause instanceof Error ? cause.message : String(cause);
  return new RepositoryError(
    'query_failed',
    `Failed to fetch ${entityName}: ${message}`,
    { cause, context },
  );
}

export function createInvalidRowShapeError(
  entityName: string,
  context: Record<string, unknown>,
): RepositoryError {
  return new RepositoryError(
    'invalid_row_shape',
    `${entityName} row has unexpected shape`,
    { context },
  );
}
