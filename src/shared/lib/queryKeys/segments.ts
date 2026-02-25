export const segmentQueryKeys = {
  children: (segmentId: string) => ['segment-child-generations', segmentId] as const,
  childrenAll: ['segment-child-generations'] as const,
  parents: (shotId: string, projectId?: string) => ['segment-parent-generations', shotId, projectId] as const,
  parentsAll: ['segment-parent-generations'] as const,
  liveTimeline: (shotId: string) => ['segment-live-timeline', shotId] as const,
  liveTimelineAll: ['segment-live-timeline'] as const,
  sourceSlot: (slotId: string) => ['source-slot-generations', slotId] as const,
  sourceSlotAll: ['source-slot-generations'] as const,
  pairMetadata: (pairId: string) => ['pair-metadata', pairId] as const,
} as const;

function keyStartsWith(key: readonly unknown[], prefix: readonly unknown[]): boolean {
  return prefix.every((value, index) => key[index] === value);
}

export function isSegmentChildrenQueryKey(key: readonly unknown[]): boolean {
  return keyStartsWith(key, segmentQueryKeys.childrenAll);
}

export function isSegmentParentsQueryKey(key: readonly unknown[]): boolean {
  return keyStartsWith(key, segmentQueryKeys.parentsAll);
}
