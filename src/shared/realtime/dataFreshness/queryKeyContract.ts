import { queryKeys } from '@/shared/lib/queryKeys';
import { taskQueryKeys } from '@/shared/lib/queryKeys/tasks';

export type FreshnessQueryKey = readonly unknown[];

export const freshnessQueryKeys = {
  tasksPaginated: (projectScope: string) => taskQueryKeys.paginated(projectScope),
  segmentChildrenPrefix: queryKeys.segments.childrenAll,
} as const;

export function serializeFreshnessQueryKey(queryKey: FreshnessQueryKey): string {
  return JSON.stringify(queryKey);
}

export function parseFreshnessQueryKey(serialized: string): unknown {
  try {
    return JSON.parse(serialized);
  } catch {
    return serialized;
  }
}

export function isSegmentChildrenQueryKey(queryKey: FreshnessQueryKey): boolean {
  return queryKey[0] === freshnessQueryKeys.segmentChildrenPrefix[0];
}
