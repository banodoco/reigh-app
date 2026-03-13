import { isCancellationError, getErrorMessage } from '@/shared/lib/errorHandling/errorUtils';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  operationFailure,
  type OperationFailure,
} from '@/shared/lib/operationResult';
import type {
  ToolSettingsErrorCode,
  ToolSettingsErrorOptions,
} from '@/shared/settings/runtime/toolSettingsTypes';

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

function isToolSettingsError(error: unknown): error is ToolSettingsError {
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

function toToolSettingsOperationFailure(error: ToolSettingsError): OperationFailure {
  return operationFailure(error, {
    policy: error.recoverable ? 'best_effort' : 'fail_closed',
    recoverable: error.recoverable,
    errorCode: error.code,
    message: error.message,
    cause: error.cause,
  });
}

export function toToolSettingsErrorFromOperationFailure(
  failure: OperationFailure,
): ToolSettingsError {
  const code = failure.errorCode;
  const normalizedCode = (
    code === 'auth_required'
    || code === 'cancelled'
    || code === 'network'
    || code === 'scope_fetch_failed'
    || code === 'invalid_scope_identifier'
    || code === 'unknown'
  ) ? code : 'unknown';

  return new ToolSettingsError(normalizedCode, failure.message, {
    recoverable: failure.recoverable,
    cause: failure.cause ?? failure.error,
  });
}

export function normalizeToolSettingsOperationFailure(error: unknown): OperationFailure {
  if (isToolSettingsError(error) && error.code === 'cancelled') {
    return toToolSettingsOperationFailure(error);
  }
  if (isCancellationError(error)) {
    return toToolSettingsOperationFailure(new ToolSettingsError('cancelled', 'Request was cancelled', {
      recoverable: true,
      cause: error,
    }));
  }

  const errorMsg = getErrorMessage(error);
  const contextInfo = {
    visibilityState: typeof document !== 'undefined' ? document.visibilityState : 'unknown',
    hidden: typeof document !== 'undefined' ? document.hidden : false,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  };

  if (errorMsg.includes('Auth timeout') || errorMsg.includes('Auth request was cancelled')) {
    normalizeAndPresentError(error, {
      context: 'fetchToolSettingsResult.authTimeout',
      showToast: false,
      logData: contextInfo,
    });
    return toToolSettingsOperationFailure(new ToolSettingsError(
      'network',
      'Authentication check timed out. Please retry.',
      {
        recoverable: true,
        cause: error,
        metadata: { ...contextInfo, reason: 'auth_timeout' },
      },
    ));
  }

  if (errorMsg.includes('Failed to fetch')) {
    normalizeAndPresentError(error, {
      context: 'fetchToolSettingsResult.network',
      showToast: false,
      logData: contextInfo,
    });
    return toToolSettingsOperationFailure(new ToolSettingsError(
      'network',
      'Network connection issue. Please check your internet connection.',
      {
        recoverable: true,
        cause: error,
        metadata: contextInfo,
      },
    ));
  }

  normalizeAndPresentError(error, {
    context: 'fetchToolSettingsResult',
    showToast: false,
    logData: contextInfo,
  });
  return toToolSettingsOperationFailure(classifyToolSettingsError(error));
}

export function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) {
    return;
  }
  throw new ToolSettingsError('cancelled', 'Request was cancelled', {
    recoverable: true,
  });
}

export async function raceWithAbort<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) {
    return promise;
  }
  throwIfAborted(signal);
  return await new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup();
      reject(new ToolSettingsError('cancelled', 'Request was cancelled', {
        recoverable: true,
      }));
    };
    const cleanup = () => {
      signal.removeEventListener('abort', onAbort);
    };
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => {
        cleanup();
        resolve(value);
      },
      (error) => {
        cleanup();
        reject(error);
      },
    );
  });
}
