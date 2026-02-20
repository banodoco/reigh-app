import type { SystemLogger } from '../_shared/systemLogger.ts';

import { allowedTransitions, isTaskStatus, isTransitionAllowed } from './transitions.ts';
import type { TaskStatus } from './types.ts';

export function validateStatusTransition(
  logger: SystemLogger,
  taskId: string,
  currentStatusRaw: string,
  requestedStatus: TaskStatus,
): Response | null {
  if (!isTaskStatus(currentStatusRaw)) {
    logger.warn('Current task status is unknown', {
      task_id: taskId,
      current_status: currentStatusRaw,
      requested_status: requestedStatus,
    });
    return null;
  }

  if (isTransitionAllowed(currentStatusRaw, requestedStatus)) {
    return null;
  }

  const allowed = allowedTransitions(currentStatusRaw);
  logger.warn('Invalid status transition', {
    task_id: taskId,
    current_status: currentStatusRaw,
    requested_status: requestedStatus,
    allowed_transitions: allowed,
  });

  return new Response(JSON.stringify({
    success: false,
    task_id: taskId,
    current_status: currentStatusRaw,
    requested_status: requestedStatus,
    allowed_transitions: allowed,
    message: `Invalid status transition: ${currentStatusRaw} → ${requestedStatus}`,
  }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  });
}
