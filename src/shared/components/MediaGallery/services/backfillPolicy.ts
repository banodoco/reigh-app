export function computeBackfillLastPage(
  totalCount: number | undefined,
  pendingDeleteCount: number,
  itemsPerPage: number,
): number {
  const nextTotal = Math.max(0, (totalCount ?? 0) - pendingDeleteCount);
  return Math.max(1, Math.ceil(nextTotal / itemsPerPage));
}
