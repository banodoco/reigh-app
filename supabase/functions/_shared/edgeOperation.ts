export type OperationFailurePolicy = 'fail_closed' | 'fail_open' | 'degrade' | 'best_effort';

export interface OperationFailure {
  ok: false;
  policy: OperationFailurePolicy;
  recoverable: boolean;
  error: Error;
  errorCode: string;
  message: string;
  cause?: unknown;
}

export interface OperationSuccess<T = void> {
  ok: true;
  policy: OperationFailurePolicy;
  recoverable: false;
  value: T;
}

export type OperationResult<T = void> = OperationSuccess<T> | OperationFailure;

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

export function operationSuccess<T>(
  value: T,
  options?: OperationSuccessOptions,
): OperationSuccess<T> {
  return {
    ok: true,
    policy: options?.policy ?? 'best_effort',
    recoverable: false,
    value,
  };
}

export function operationFailure(
  error: unknown,
  options?: OperationFailureOptions,
): OperationFailure {
  const normalizedError = error instanceof Error
    ? error
    : new Error(options?.message ?? String(error));

  return {
    ok: false,
    policy: options?.policy ?? 'best_effort',
    recoverable: options?.recoverable ?? true,
    error: normalizedError,
    errorCode: options?.errorCode ?? 'operation_failed',
    message: options?.message ?? normalizedError.message,
    cause: options?.cause,
  };
}
