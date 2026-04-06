import { useEffect, type RefObject } from 'react';

/**
 * Stops native `mousedown` events at the portal boundary so DOM-based click-away
 * listeners do not misclassify portal content as "outside".
 *
 * `createPortal()` keeps React synthetic bubbling attached to the React tree, but
 * the rendered DOM node lives under the portal host (usually `document.body`).
 * `Node.contains()` only follows DOM ancestry, so a click-away listener attached
 * to a non-portal ancestor can see a menu item inside the portal as outside even
 * though it is part of the same React subtree. That mismatch is expected portal
 * behavior, not a React 18 regression.
 */
export function usePortalMousedownGuard(
  ref: RefObject<HTMLElement | null>,
  enabled: boolean = true,
) {
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const element = ref.current;
    if (!element) {
      return undefined;
    }

    const stopPropagation = (event: MouseEvent) => {
      event.stopPropagation();
    };

    element.addEventListener('mousedown', stopPropagation);
    return () => {
      element.removeEventListener('mousedown', stopPropagation);
    };
  }, [enabled, ref]);
}
