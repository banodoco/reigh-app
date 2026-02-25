import { useEffect, useRef } from 'react';
import { isMobileUA } from '@/shared/hooks/mobile';

interface UseMobileTimeoutFallbackOptions {
  /** Whether the operation is currently in a loading state */
  isLoading: boolean;
  /** Called when the timeout fires while still loading (e.g. retry fetch, set defaults) */
  onTimeout: () => void;
  /** Timeout duration on mobile devices (default: 15000ms) */
  mobileTimeoutMs?: number;
  /** Timeout duration on desktop (default: 10000ms) */
  desktopTimeoutMs?: number;
  /** Whether the fallback is enabled (default: true) */
  enabled?: boolean;
}

/**
 * Shared mobile stall recovery hook.
 *
 * When `isLoading` becomes true, starts a timer (longer on mobile).
 * If loading hasn't finished by the time the timer fires, calls `onTimeout`.
 * Timer is cleared when loading finishes or the component unmounts.
 *
 * Replaces inline [MobileStallFix] patterns in ProjectContext and UserSettingsContext.
 */
export function useMobileTimeoutFallback({
  isLoading,
  onTimeout,
  mobileTimeoutMs = 15000,
  desktopTimeoutMs = 10000,
  enabled = true,
}: UseMobileTimeoutFallbackOptions): void {
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!enabled || !isLoading) return;

    const isMobile = isMobileUA();
    const timeoutMs = isMobile ? mobileTimeoutMs : desktopTimeoutMs;

    const timer = setTimeout(() => {
      onTimeoutRef.current();
    }, timeoutMs);

    return () => {
      clearTimeout(timer);
    };
  }, [isLoading, enabled, mobileTimeoutMs, desktopTimeoutMs]);
}
