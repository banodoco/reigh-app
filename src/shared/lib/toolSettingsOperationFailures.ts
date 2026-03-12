import { isCancellationError, getErrorMessage } from '@/shared/lib/errorHandling/errorUtils';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import {
  operationFailure,
  type OperationFailure,
} from '@/shared/lib/operationResult';
import {
  classifyToolSettingsError,
  isToolSettingsError,
  ToolSettingsError,
} from './toolSettingsErrors';

export function toToolSettingsOperationFailure(error: ToolSettingsError): OperationFailure {
  return operationFailure(error, {
    policy: error.recoverable ? 'best_effort' : 'fail_closed',
    recoverable: error.recoverable,
    errorCode: error.code,
    message: error.message,
    cause: error.cause,
  });
}

export function toToolSettingsErrorFromOperationFailure(failure: OperationFailure): ToolSettingsError {
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
      context: 'fetchToolSettingsSupabase.authTimeout',
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
      context: 'fetchToolSettingsSupabase.network',
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
    context: 'fetchToolSettingsSupabase',
    showToast: false,
    logData: contextInfo,
  });
  return toToolSettingsOperationFailure(classifyToolSettingsError(error));
}
