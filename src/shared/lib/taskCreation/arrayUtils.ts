/** Expand or truncate array to the segment count contract. */
export function expandArrayToCount<T>(arr: T[] | undefined, targetCount: number): T[] {
  if (!arr || arr.length === 0) {
    return [];
  }

  if (arr.length === 1 && targetCount > 1) {
    return Array(targetCount).fill(arr[0]);
  }

  if (arr.length > targetCount) {
    return arr.slice(0, targetCount);
  }

  return arr;
}
