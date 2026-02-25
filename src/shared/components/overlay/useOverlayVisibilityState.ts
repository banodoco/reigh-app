import { useCallback, useMemo, useState } from 'react';
import type { OptionalOverlayVisibilityState, OverlayVisibilityState } from './contracts';

interface OverlayVisibilityOptions extends OptionalOverlayVisibilityState {
  defaultOpen?: boolean;
}

/**
 * Standard overlay visibility ownership pattern:
 * - controlled when `open` is provided
 * - uncontrolled fallback when omitted
 */
export function useOverlayVisibilityState(
  options: OverlayVisibilityOptions,
): OverlayVisibilityState {
  const { open, onOpenChange, defaultOpen = false } = options;
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isControlled = open !== undefined;

  const resolvedOpen = isControlled ? open : internalOpen;
  const resolvedOnOpenChange = useCallback((nextOpen: boolean) => {
    if (!isControlled) {
      setInternalOpen(nextOpen);
    }
    onOpenChange?.(nextOpen);
  }, [isControlled, onOpenChange]);

  return useMemo(() => ({
    open: resolvedOpen,
    onOpenChange: resolvedOnOpenChange,
  }), [resolvedOnOpenChange, resolvedOpen]);
}
