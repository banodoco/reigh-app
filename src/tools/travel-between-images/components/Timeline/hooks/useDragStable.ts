import { useRef } from 'react';

export function useDragStable<T>(
  live: T,
  isDragging: boolean,
  merge?: (snapshot: T, live: T) => T,
): T {
  const snapshot = useRef<T>(live);
  if (!isDragging) {
    snapshot.current = live;
    return live;
  }
  return merge ? merge(snapshot.current, live) : snapshot.current;
}
