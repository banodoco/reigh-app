import { useState, useCallback, useEffect, useRef } from 'react';

/**
 * Hook for showing something temporarily with auto-hide.
 *
 * Useful for transient UI hints, tooltips, or feedback that should
 * appear briefly then disappear automatically.
 *
 * @param duration - How long to show before auto-hiding (ms), default 2000
 * @returns { isVisible, show, hide }
 *
 * @example
 * const hint = useTemporaryVisibility(2000);
 *
 * // Show the hint (auto-hides after 2s)
 * hint.show();
 *
 * // Manually hide early
 * hint.hide();
 *
 * // In JSX
 * {hint.isVisible && <div>Temporary hint!</div>}
 */
export function useTemporaryVisibility(duration = 2000) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const clearPendingTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const show = useCallback(() => {
    setIsVisible(true);
    clearPendingTimeout();
    timeoutRef.current = setTimeout(() => {
      setIsVisible(false);
      timeoutRef.current = null;
    }, duration);
  }, [duration, clearPendingTimeout]);

  const hide = useCallback(() => {
    setIsVisible(false);
    clearPendingTimeout();
  }, [clearPendingTimeout]);

  // Cleanup on unmount
  useEffect(() => {
    return () => clearPendingTimeout();
  }, [clearPendingTimeout]);

  return { isVisible, show, hide };
}
