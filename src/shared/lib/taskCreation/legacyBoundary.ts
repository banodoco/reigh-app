import { TaskValidationError } from './types';

/**
 * Build the one canonical error used when a producer still targets a legacy
 * task family.  UI producers use this before starting placeholder work,
 * uploads, enhancement, or any submission-side effects; the task boundary
 * uses the same error as the final defense in depth.
 */
export function unsupportedLegacyTaskError(family: string): TaskValidationError {
  return new TaskValidationError(
    `Legacy task family ${family} is unsupported; migrate the producer to a canonical Astrid capability before submission`,
    'capability_id',
  );
}
