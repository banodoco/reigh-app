import type React from 'react';

interface RecoverableErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export function createRecoveredErrorBoundaryState(): RecoverableErrorBoundaryState {
  return {
    hasError: false,
    error: null,
    errorInfo: null,
  };
}
