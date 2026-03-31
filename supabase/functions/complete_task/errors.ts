export interface CompletionErrorMetadata {
  [key: string]: unknown;
}

export class CompletionError extends Error {
  code: string;
  recoverable: boolean;
  context: string;
  metadata?: CompletionErrorMetadata;
  override cause?: unknown;

  constructor(options: {
    code: string;
    message: string;
    context: string;
    recoverable: boolean;
    metadata?: CompletionErrorMetadata;
    cause?: unknown;
  }) {
    super(options.message);
    this.name = 'CompletionError';
    this.code = options.code;
    this.recoverable = options.recoverable;
    this.context = options.context;
    this.metadata = options.metadata;
    this.cause = options.cause;
  }
}

export function toCompletionError(
  error: unknown,
  options: {
    code: string;
    context: string;
    recoverable: boolean;
    message: string;
    metadata?: CompletionErrorMetadata;
  },
): CompletionError {
  if (error instanceof CompletionError) {
    return new CompletionError({
      code: options.code,
      context: options.context,
      recoverable: options.recoverable,
      message: options.message,
      metadata: {
        ...(error.metadata ?? {}),
        ...(options.metadata ?? {}),
        wrapped_error_code: error.code,
        wrapped_error_context: error.context,
        wrapped_error_recoverable: error.recoverable,
        wrapped_error_message: error.message,
      },
      cause: error,
    });
  }

  const causeMessage = error instanceof Error ? error.message : String(error);

  return new CompletionError({
    code: options.code,
    context: options.context,
    recoverable: options.recoverable,
    message: options.message,
    metadata: {
      ...(options.metadata ?? {}),
      cause_message: causeMessage,
    },
    cause: error,
  });
}
