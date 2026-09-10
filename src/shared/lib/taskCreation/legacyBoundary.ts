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

/**
 * Build the typed error for a capability that is deliberately withdrawn from
 * admission until its pinned executor graph is semantically proven.  Keep
 * this check before capability lookup or CAS ingestion so the producer cannot
 * create orphaned inputs for a capability Runtime will never claim.
 */
export function unsupportedCapabilityError(capabilityId: string, reason: string): TaskValidationError {
  return new TaskValidationError(
    `Astrid capability ${capabilityId} is unsupported until its executor is repaired: ${reason}`,
    'capability_id',
  );
}
