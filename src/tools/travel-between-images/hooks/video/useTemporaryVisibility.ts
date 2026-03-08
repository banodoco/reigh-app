import { useState, useCallback, useEffect, useRef } from 'react';

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
