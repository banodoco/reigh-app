import { useEffect, useRef, useCallback, RefObject } from 'react';

type EventType = 'click' | 'mousedown' | 'touchstart';

interface UseClickOutsideOptions {
  /** Event type(s) to listen for (default: ['mousedown']) */
  events?: EventType[];
  /** Whether the hook is enabled (default: true) */
  enabled?: boolean;
  /** Delay before attaching listeners (ms) - prevents catching the click that opened the element */
  delay?: number;
  /** Use capture phase for event listeners */
  capture?: boolean;
}

/**
 * Hook that calls a callback when user clicks/touches outside the referenced element.
 *
 * @param callback - Function to call when click outside is detected
 * @param options - Configuration options
 * @returns ref - Attach this to the element you want to detect clicks outside of
 *
 * @example
 * // Basic usage - click outside to close
 * const ref = useClickOutside(() => setIsOpen(false));
 * return <div ref={ref}>...</div>;
 *
 * @example
 * // With options - touch support for iPad
 * const ref = useClickOutside(
 *   () => setSelectedEndpoint(null),
 *   { events: ['touchstart'], enabled: isTablet && selectedEndpoint !== null }
 * );
 *
 * @example
 * // With existing ref
 * const containerRef = useRef<HTMLDivElement>(null);
 * useClickOutside(() => setIsActive(false), { enabled: isActive }, containerRef);
 */
export function useClickOutside<T extends HTMLElement = HTMLDivElement>(
  callback: () => void,
  options: UseClickOutsideOptions = {},
  existingRef?: RefObject<T>
): RefObject<T> {
  const {
    events = ['mousedown'],
    enabled = true,
    delay = 0,
    capture = false,
  } = options;

  const internalRef = useRef<T>(null);
  const ref = existingRef || internalRef;
  const callbackRef = useRef(callback);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const handleEvent = useCallback((event: Event) => {
    if (ref.current && !ref.current.contains(event.target as Node)) {
      callbackRef.current();
    }
  }, [ref]);

  useEffect(() => {
    if (!enabled) return;

    const subscribe = () => {
      events.forEach((eventType) => {
        document.addEventListener(eventType, handleEvent, { capture });
      });
    };

    const unsubscribe = () => {
      events.forEach((eventType) => {
        document.removeEventListener(eventType, handleEvent, { capture });
      });
    };

    // Delay subscription to avoid catching the event that triggered this state
    const timeoutId = delay > 0 ? setTimeout(subscribe, delay) : null;
    if (!timeoutId) subscribe();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [enabled, events, handleEvent, delay, capture]);

  return ref;
}
