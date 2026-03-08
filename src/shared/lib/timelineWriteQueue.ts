import { isAbortError } from '@/shared/lib/errorHandling/errorUtils';

// --- Timeline write logging ---

type TimelineWritePhase = 'queued' | 'start' | 'end';

interface TimelineWriteEventMeta {
  shotId: string;
  operation: string;
  waitMs: number;
  durationMs: number;
  queueDepth: number;
  requestId: number;
  blockedByOperation?: string | null;
  blockedByDurationMs?: number | null;
}

type TimelineWriteEventHandler = (phase: TimelineWritePhase, meta: TimelineWriteEventMeta) => void;

interface TimelineWriteLoggerOptions {
  logPrefix: string;
  log?: (...args: Parameters<typeof console.log>) => void;
}

function shortTimelineId(value: string | null | undefined): string | null {
  return value ? value.slice(0, 8) : null;
}

/**
 * Shared queue-phase logger for timeline write serialization.
 * Keeps queue observability structure consistent across timeline hooks.
 */
export function createTimelineWriteQueueLogger(options: TimelineWriteLoggerOptions): TimelineWriteEventHandler {
  const log = options.log ?? console.log;
  return (phase, meta) => {
    const payload: Record<string, unknown> = {
      shotId: shortTimelineId(meta.shotId),
      requestId: meta.requestId,
      operation: meta.operation,
      waitMs: meta.waitMs,
      queueDepth: meta.queueDepth,
      blockedByOperation: meta.blockedByOperation ?? null,
      blockedByDurationMs: meta.blockedByDurationMs ?? null,
    };

    if (phase !== 'start') {
      payload.durationMs = meta.durationMs;
    }

    log(`${options.logPrefix} write queue ${phase}`, payload);
  };
}

// --- Timeline write timeout ---

const DEFAULT_TIMELINE_WRITE_TIMEOUT_MS = 15_000;
const TIMELINE_WRITE_TIMEOUT_CODE = 'TIMELINE_WRITE_TIMEOUT';

interface TimelineWriteTimeoutOptions {
  timeoutMs?: number;
  onTimeout?: (meta: { operation: string; timeoutMs: number; pendingMs: number }) => void;
  upstreamSignal?: AbortSignal;
}

class TimelineWriteTimeoutError extends Error {
  readonly code = TIMELINE_WRITE_TIMEOUT_CODE;

  constructor(operation: string, timeoutMs: number, cause?: unknown) {
    super(`Timeline write "${operation}" timed out after ${timeoutMs}ms`);
    this.name = 'TimelineWriteTimeoutError';
    if (cause !== undefined) {
      (this as { cause?: unknown }).cause = cause;
    }
  }
}

export function isTimelineWriteTimeoutError(error: unknown): error is TimelineWriteTimeoutError {
  return (
    error instanceof TimelineWriteTimeoutError
    || (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: unknown }).code === TIMELINE_WRITE_TIMEOUT_CODE
    )
  );
}

export async function runTimelineWriteWithTimeout<T>(
  operation: string,
  task: (signal: AbortSignal) => Promise<T>,
  options?: TimelineWriteTimeoutOptions,
): Promise<T> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMELINE_WRITE_TIMEOUT_MS;
  const startedAt = Date.now();
  const controller = new AbortController();
  let timedOut = false;
  let abortedByUpstream = false;

  const upstreamSignal = options?.upstreamSignal;
  const handleUpstreamAbort = () => {
    abortedByUpstream = true;
    controller.abort();
  };
  if (upstreamSignal) {
    if (upstreamSignal.aborted) {
      handleUpstreamAbort();
    } else {
      upstreamSignal.addEventListener('abort', handleUpstreamAbort, { once: true });
    }
  }

  const timeoutId = setTimeout(() => {
    timedOut = true;
    options?.onTimeout?.({
      operation,
      timeoutMs,
      pendingMs: Date.now() - startedAt,
    });
    controller.abort();
  }, timeoutMs);

  try {
    return await task(controller.signal);
  } catch (error) {
    if (timedOut || (abortedByUpstream && controller.signal.aborted) || (controller.signal.aborted && isAbortError(error))) {
      throw new TimelineWriteTimeoutError(operation, timeoutMs, error);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    if (upstreamSignal) {
      upstreamSignal.removeEventListener('abort', handleUpstreamAbort);
    }
  }
}

// --- Serialized timeline write queue ---

const shotWriteTail = new Map<string, Promise<void>>();
const shotWriteDepth = new Map<string, number>();
const shotWriteActive = new Map<string, { requestId: number; operation: string; startedAt: number }>();
let writeRequestCounter = 0;
const DEFAULT_SERIALIZED_TIMELINE_TASK_TIMEOUT_MS = 30_000;

interface TimelineSerializedWriteOptions {
  timeoutMs?: number;
  onTimeout?: (meta: {
    shotId: string;
    operation: string;
    timeoutMs: number;
    pendingMs: number;
    requestId: number;
  }) => void;
}

/**
 * Returns true if any serialized timeline write is active or queued for the
 * given shot. Both the timeline drag path and the batch editor path go through
 * runSerializedTimelineWrite, so this covers all writes across both paths.
 * Used by useTimelinePositions.syncFromDatabase to suppress stale syncs while
 * the batch editor is writing (the batch editor does not set isLockedRef, so
 * without this check a background refetch during the midpoint RPC would snap
 * positions back to pre-edit values).
 */
export function isTimelineWriteActive(shotId: string): boolean {
  return (shotWriteDepth.get(shotId) ?? 0) > 0;
}

/**
 * Serialize timeline writes per shot to avoid overlapping updates from
 * different UI flows (batch reorder, timeline drag, etc.).
 */
export async function runSerializedTimelineWrite<T>(
  shotId: string,
  operation: string,
  task: (signal: AbortSignal) => Promise<T>,
  onEvent?: TimelineWriteEventHandler,
  options?: TimelineSerializedWriteOptions,
): Promise<T> {
  const requestId = ++writeRequestCounter;
  const queuedAt = Date.now();
  const previousTail = shotWriteTail.get(shotId) ?? Promise.resolve();
  const nextDepth = (shotWriteDepth.get(shotId) ?? 0) + 1;
  shotWriteDepth.set(shotId, nextDepth);
  const blockedBy = shotWriteActive.get(shotId);
  const blockedByDurationMs = blockedBy ? Math.max(0, queuedAt - blockedBy.startedAt) : null;

  onEvent?.('queued', {
    shotId,
    operation,
    waitMs: 0,
    durationMs: 0,
    queueDepth: Math.max(0, nextDepth - 1),
    requestId,
    blockedByOperation: blockedBy?.operation ?? null,
    blockedByDurationMs,
  });

  let releaseTail!: () => void;
  const currentTail = new Promise<void>((resolve) => {
    releaseTail = resolve;
  });

  const chainedTail = previousTail.catch(() => undefined).then(() => currentTail);
  shotWriteTail.set(shotId, chainedTail);

  await previousTail.catch(() => undefined);

  const startedAt = Date.now();
  shotWriteActive.set(shotId, {
    requestId,
    operation,
    startedAt,
  });
  onEvent?.('start', {
    shotId,
    operation,
    waitMs: startedAt - queuedAt,
    durationMs: 0,
    queueDepth: Math.max(0, (shotWriteDepth.get(shotId) ?? 1) - 1),
    requestId,
    blockedByOperation: blockedBy?.operation ?? null,
    blockedByDurationMs,
  });

  try {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_SERIALIZED_TIMELINE_TASK_TIMEOUT_MS;
    return await runTimelineWriteWithTimeout(
      operation,
      task,
      {
        timeoutMs,
        onTimeout: ({ pendingMs }) => {
          options?.onTimeout?.({
            shotId,
            operation,
            timeoutMs,
            pendingMs,
            requestId,
          });
        },
      },
    );
  } finally {
    releaseTail();

    const remainingDepth = Math.max(0, (shotWriteDepth.get(shotId) ?? 1) - 1);
    if (remainingDepth === 0) {
      shotWriteDepth.delete(shotId);
    } else {
      shotWriteDepth.set(shotId, remainingDepth);
    }

    if (shotWriteTail.get(shotId) === chainedTail) {
      shotWriteTail.delete(shotId);
    }
    if (shotWriteActive.get(shotId)?.requestId === requestId) {
      shotWriteActive.delete(shotId);
    }

    onEvent?.('end', {
      shotId,
      operation,
      waitMs: startedAt - queuedAt,
      durationMs: Date.now() - startedAt,
      queueDepth: Math.max(0, remainingDepth - 1),
      requestId,
      blockedByOperation: blockedBy?.operation ?? null,
      blockedByDurationMs,
    });
  }
}
