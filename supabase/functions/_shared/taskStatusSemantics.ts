export const TASK_FAILURE_STATUSES = ['Failed', 'Cancelled'] as const;

export function isFailureStatus(status: string): boolean {
  return (TASK_FAILURE_STATUSES as readonly string[]).includes(status);
}
