import { useEffect, useRef } from 'react';

/**
 * React replays effect cleanup/setup while keeping provider-owned resources
 * during StrictMode and Fast Refresh. Terminal disposal must wait until that
 * synchronous replay ends; subscriptions still unsubscribe in their effects.
 * A changed resource finalizes independently, so an old cleanup cannot dispose
 * its replacement. Direct resource.dispose() retains its terminal semantics.
 */
export function useOwnedResourceDisposal<T>(
  resource: T,
  dispose: (resource: T) => void,
): void {
  const disposerRef = useRef(dispose);
  disposerRef.current = dispose;
  const pendingRef = useRef(new Map<T, { cancelled: boolean }>());

  useEffect(() => {
    const pendingDisposals = pendingRef.current;
    const previous = pendingDisposals.get(resource);
    if (previous) {
      previous.cancelled = true;
      pendingDisposals.delete(resource);
    }
    const disposeResource = disposerRef.current;
    return () => {
      const pending = { cancelled: false };
      pendingDisposals.set(resource, pending);
      queueMicrotask(() => {
        if (!pending.cancelled) disposeResource(resource);
        if (pendingDisposals.get(resource) === pending) pendingDisposals.delete(resource);
      });
    };
  }, [resource]);
}
