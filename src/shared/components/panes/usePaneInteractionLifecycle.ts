import { useEffect, useRef, useState } from 'react';

interface UsePaneInteractionLifecycleOptions {
  isOpen: boolean;
  transitionMs?: number;
  disableInteractionsDuringOpen?: boolean;
  onOpenStart?: () => void;
  onClose?: () => void;
}

interface PaneInteractionLifecycleState {
  isPointerEventsEnabled: boolean;
  isInteractionDisabled: boolean;
}

const DEFAULT_TRANSITION_MS = 300;

export function usePaneInteractionLifecycle({
  isOpen,
  transitionMs = DEFAULT_TRANSITION_MS,
  disableInteractionsDuringOpen = false,
  onOpenStart,
  onClose,
}: UsePaneInteractionLifecycleOptions): PaneInteractionLifecycleState {
  const [isPointerEventsEnabled, setIsPointerEventsEnabled] = useState(false);
  const [isInteractionDisabled, setIsInteractionDisabled] = useState(false);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    const justClosed = !isOpen && wasOpenRef.current;
    wasOpenRef.current = isOpen;

    if (justOpened) {
      onOpenStart?.();
      setIsPointerEventsEnabled(false);
      if (disableInteractionsDuringOpen) {
        setIsInteractionDisabled(true);
      }

      const pointerTimer = window.setTimeout(() => {
        setIsPointerEventsEnabled(true);
      }, transitionMs);

      const interactionTimer = disableInteractionsDuringOpen
        ? window.setTimeout(() => setIsInteractionDisabled(false), transitionMs)
        : null;

      return () => {
        window.clearTimeout(pointerTimer);
        if (interactionTimer !== null) {
          window.clearTimeout(interactionTimer);
        }
      };
    }

    if (justClosed) {
      onClose?.();
      setIsPointerEventsEnabled(false);
      setIsInteractionDisabled(false);
    }

    return;
  }, [
    disableInteractionsDuringOpen,
    isOpen,
    onClose,
    onOpenStart,
    transitionMs,
  ]);

  return { isPointerEventsEnabled, isInteractionDisabled };
}
