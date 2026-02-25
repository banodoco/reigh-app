export type OperationFailurePolicy = 'fail_closed' | 'fail_open' | 'degrade' | 'best_effort';

export interface OperationSuccess<T> {
  ok: true;
  value: T;
  policy: OperationFailurePolicy;
  recoverable: false;
}

export interface OperationFailure {
  ok: false;
  error: Error;
  message: string;
  recoverable: boolean;
  policy: OperationFailurePolicy;
  errorCode: string;
  cause?: unknown;
}

export type OperationResult<T> = OperationSuccess<T> | OperationFailure;

export class OperationResultError extends Error {
  errorCode: string;
  policy: OperationFailurePolicy;
  recoverable: boolean;
  cause?: unknown;

  constructor(options: {
    message: string;
    errorCode: string;
    policy: OperationFailurePolicy;
    recoverable: boolean;
    cause?: unknown;
    sourceError?: Error;
  }) {
    super(options.message);
    this.name = 'OperationResultError';
    this.errorCode = options.errorCode;
    this.policy = options.policy;
    this.recoverable = options.recoverable;
    this.cause = options.cause;

    // Preserve the original stack for easier debugging when available.
    if (options.sourceError?.stack) {
      this.stack = options.sourceError.stack;
    }
  }
}

interface OperationSuccessOptions {
  policy?: OperationFailurePolicy;
}

interface OperationFailureOptions {
  policy?: OperationFailurePolicy;
  recoverable?: boolean;
  errorCode?: string;
  message?: string;
  cause?: unknown;
}

export function operationSuccess<T>(value: T, options?: OperationSuccessOptions): OperationSuccess<T> {
  return {
    ok: true,
    value,
    policy: options?.policy ?? 'best_effort',
    recoverable: false,
  };
}

export function operationFailure(error: unknown, options?: OperationFailureOptions): OperationFailure {
  const normalizedError = error instanceof Error ? error : new Error(String(error));
  return {
    ok: false,
    error: normalizedError,
    message: options?.message ?? normalizedError.message,
    recoverable: options?.recoverable ?? true,
    policy: options?.policy ?? 'best_effort',
    errorCode: options?.errorCode ?? 'operation_failed',
    ...(options?.cause !== undefined ? { cause: options.cause } : {}),
  };
}

/**
 * Convert a structured operation failure into an Error while preserving machine-readable metadata.
 */
export function toOperationResultError(failure: OperationFailure): OperationResultError {
  return new OperationResultError({
    message: failure.message,
    errorCode: failure.errorCode,
    policy: failure.policy,
    recoverable: failure.recoverable,
    cause: failure.cause,
    sourceError: failure.error,
  });
}
