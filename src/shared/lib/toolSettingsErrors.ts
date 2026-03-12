import { isCancellationError, getErrorMessage } from '@/shared/lib/errorHandling/errorUtils';

type ToolSettingsErrorCode =
  | 'auth_required'
  | 'cancelled'
  | 'network'
  | 'scope_fetch_failed'
  | 'invalid_scope_identifier'
  | 'unknown';

interface ToolSettingsErrorOptions {
  recoverable?: boolean;
  cause?: unknown;
  metadata?: Record<string, unknown>;
}

export class ToolSettingsError extends Error {
  readonly code: ToolSettingsErrorCode;
  readonly recoverable: boolean;
  readonly metadata?: Record<string, unknown>;
  readonly cause?: unknown;

  constructor(
    code: ToolSettingsErrorCode,
    message: string,
    options: ToolSettingsErrorOptions = {},
  ) {
    super(message);
    this.name = 'ToolSettingsError';
    this.code = code;
    this.recoverable = options.recoverable ?? false;
    this.metadata = options.metadata;
    this.cause = options.cause;
  }
}

export function isToolSettingsError(error: unknown): error is ToolSettingsError {
  return error instanceof ToolSettingsError;
}

export function classifyToolSettingsError(error: unknown): ToolSettingsError {
  if (isToolSettingsError(error)) {
    return error;
  }
  if (isCancellationError(error)) {
    return new ToolSettingsError('cancelled', 'Request was cancelled', {
      recoverable: true,
      cause: error,
    });
  }
  const message = getErrorMessage(error);
  if (message.includes('Authentication required')) {
    return new ToolSettingsError('auth_required', message, {
      recoverable: false,
      cause: error,
    });
  }
  if (
    message.includes('Failed to fetch')
    || message.includes('ERR_INSUFFICIENT_RESOURCES')
    || message.includes('Network connection issue')
    || message.includes('Network exhaustion')
  ) {
    return new ToolSettingsError('network', message, {
      recoverable: true,
      cause: error,
    });
  }
  return new ToolSettingsError('unknown', message, {
    recoverable: false,
    cause: error,
  });
}
