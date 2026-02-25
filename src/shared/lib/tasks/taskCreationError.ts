import { TaskValidationError } from '../taskCreation';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

interface TaskErrorHandlingOptions {
  context: string;
  showToast?: boolean;
}

/**
 * Keep task-input contract failures explicit while normalizing unexpected runtime errors.
 */
export function rethrowTaskCreationError(
  error: unknown,
  options: TaskErrorHandlingOptions,
): never {
  if (error instanceof TaskValidationError) {
    throw error;
  }

  throw normalizeAndPresentError(error, {
    context: options.context,
    showToast: options.showToast ?? false,
  });
}
