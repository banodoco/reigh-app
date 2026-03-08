import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';

export function flashSuccessForDuration(
  setSuccess: (value: boolean) => void,
  durationMs = 1500,
): void {
  setSuccess(true);
  setTimeout(() => setSuccess(false), durationMs);
}

export function invalidateTaskAndProjectQueries(
  queryClient: QueryClient,
  projectId: string | null | undefined,
): void {
  queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
  if (projectId) {
    queryClient.invalidateQueries({ queryKey: queryKeys.unified.projectPrefix(projectId) });
  }
}
