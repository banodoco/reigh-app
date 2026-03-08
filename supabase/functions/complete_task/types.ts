/**
 * Shared types for the complete_task edge function.
 */

/**
 * Logger interface used throughout the completion flow.
 *
 * Matches the subset of SystemLogger methods consumed by generation,
 * orchestrator, and helper modules.  Keeping it minimal lets callers
 * pass the full SystemLogger (or a test double) without coupling to
 * the concrete class.
 */
export interface CompletionLogger {
  debug: (msg: string, ctx?: Record<string, unknown>) => void;
  info: (msg: string, ctx?: Record<string, unknown>) => void;
  warn: (msg: string, ctx?: Record<string, unknown>) => void;
  error: (msg: string, ctx?: Record<string, unknown>) => void;
}
