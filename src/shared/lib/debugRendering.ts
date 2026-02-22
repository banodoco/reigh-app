import { useRef } from 'react';
import { debugConfig } from './debugConfig';

/** Renders per second above which we warn about a potential loop. */
const LOOP_DETECT_THRESHOLD = 15;
/** Time window used for loop detection. */
const LOOP_DETECT_WINDOW_MS = 1000;

/**
 * Dev-only render-rate tracker and loop detector.
 *
 * - Always warns in development when a hook/component renders ≥15 times/second.
 *   (React Strict Mode doubles invocations; the threshold accounts for this.)
 * - Logs periodic render counts only when `debugConfig.renderLogging` is enabled.
 *   Enable at runtime: `window.debugConfig.enable('renderLogging')`
 *   Enable via env:    `VITE_DEBUG_RENDER_LOGGING=true` in .env.local
 *
 * Safe no-op in production (bundler eliminates the body).
 *
 * @example
 *   useRenderLogger('useImageGenForm')
 *   useRenderLogger('ProjectProvider', { userId, selectedProjectId })
 */
export function useRenderLogger(label: string, data?: Record<string, unknown>): void {
  const countRef = useRef(0);
  const windowTimestampsRef = useRef<number[]>([]);

  if (process.env.NODE_ENV === 'development') {
    countRef.current++;
    const now = Date.now();
    windowTimestampsRef.current.push(now);

    // Drop timestamps outside the detection window
    const cutoff = now - LOOP_DETECT_WINDOW_MS;
    let i = 0;
    while (i < windowTimestampsRef.current.length && windowTimestampsRef.current[i] < cutoff) {
      i++;
    }
    if (i > 0) windowTimestampsRef.current.splice(0, i);

    const recentCount = windowTimestampsRef.current.length;
    const total = countRef.current;

    if (recentCount >= LOOP_DETECT_THRESHOLD) {
      // Always surface loop warnings regardless of renderLogging flag — primary diagnostic signal
      console.warn(
        `[RenderLoop] ${label} — ${recentCount} renders in ${LOOP_DETECT_WINDOW_MS}ms (total: ${total})`,
        data ?? ''
      );
    } else if (debugConfig.isEnabled('renderLogging') && (total <= 3 || total % 25 === 0)) {
    }
  }
}

/**
 * Dev-only dep-change tracker.
 *
 * Logs which values in a named deps map changed since the previous render.
 * Useful for diagnosing why effects fire unexpectedly (e.g., inline objects
 * creating new references every render).
 *
 * Only logs when `debugConfig.renderLogging` is enabled, or `force = true`.
 *
 * @example
 *   useChangedDepsLogger('useImageGenForm[stateMapping]', {
 *     imagesPerPrompt, selectedLoras, beforeEachPromptText,
 *   });
 */
export function useChangedDepsLogger(
  label: string,
  deps: Record<string, unknown>,
  force = false,
): void {
  const prevRef = useRef<Record<string, unknown>>({});

  if (process.env.NODE_ENV === 'development') {
    if (force || debugConfig.isEnabled('renderLogging')) {
      const changed: Record<string, { from: unknown; to: unknown }> = {};
      for (const key of Object.keys(deps)) {
        if (!Object.is(deps[key], prevRef.current[key])) {
          changed[key] = { from: prevRef.current[key], to: deps[key] };
        }
      }
    }
    // Always update ref so tracking stays accurate when logging is toggled at runtime
    prevRef.current = deps;
  }
}
