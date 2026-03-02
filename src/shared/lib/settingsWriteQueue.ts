/**
 * Global Settings Write Queue
 *
 * Prevents network exhaustion by serializing and coalescing settings writes.
 *
 * Features:
 * - Global concurrency limit (default: 1 in-flight write)
 * - Per-target debouncing (coalesces rapid updates)
 * - Merge-on-write (latest patch wins per field)
 * - Optional AbortSignal passthrough for caller cancellation
 * - Best-effort flush on page unload
 *
 * @see settings_system.md for the full settings architecture
 */

import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';

export interface QueuedWrite {
  scope: 'user' | 'project' | 'shot';
  entityId: string;
  toolId: string;
  patch: Record<string, unknown>;
  signal?: AbortSignal;
}

interface PendingWrite {
  write: QueuedWrite;
  resolvers: Array<{ resolve: (value: unknown) => void; reject: (error: unknown) => void }>;
  timerId: NodeJS.Timeout | null;
  enqueuedAt: number;
}

// Configuration
const DEBOUNCE_MS = 300;
const MAX_CONCURRENT = 1;

// State
const pendingByTarget = new Map<string, PendingWrite>();
let inFlightCount = 0;
const flushQueue: Array<{ targetKey: string; pending: PendingWrite }> = [];

// The actual write function - injected to avoid circular imports
let writeFunction: ((write: QueuedWrite) => Promise<unknown>) | null = null;

function createAbortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Request was cancelled', 'AbortError');
  }
  const error = new Error('Request was cancelled');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

/**
 * Set the write function that performs the actual DB update.
 * Must be called once at app init (in useToolSettings.ts).
 */
export function setSettingsWriteFunction(fn: (write: QueuedWrite) => Promise<unknown>) {
  writeFunction = fn;
}

/**
 * Create a unique key for deduplication
 */
function targetKey(write: QueuedWrite): string {
  return `${write.scope}:${write.entityId}:${write.toolId}`;
}

/**
 * Shallow merge (one level deep)
 */
function shallowMergePatch(existing: Record<string, unknown>, incoming: Record<string, unknown>): Record<string, unknown> {
  return { ...existing, ...incoming };
}

/**
 * Process the next item in the flush queue
 */
async function processQueue() {
  if (inFlightCount >= MAX_CONCURRENT || flushQueue.length === 0) {
    return;
  }

  const next = flushQueue.shift();
  if (!next) return;

  const { targetKey: key, pending } = next;
  
  // Remove from pending map (we're about to process it)
  pendingByTarget.delete(key);
  
  inFlightCount++;
  
  try {
    if (!writeFunction) {
      throw new Error('[SettingsWriteQueue] Write function not initialized');
    }

    throwIfAborted(pending.write.signal);
    const result = await writeFunction(pending.write);
    
    // Resolve all waiters
    for (const { resolve } of pending.resolvers) {
      resolve(result);
    }
  } catch (error) {
    normalizeAndPresentError(error, { context: 'SettingsWriteQueue', showToast: false });

    // Reject all waiters
    for (const { reject } of pending.resolvers) {
      reject(error);
    }
  } finally {
    inFlightCount--;
    
    // Process next item
    processQueue();
  }
}

/**
 * Schedule a pending write for flush
 */
function scheduleFlush(key: string, pending: PendingWrite) {
  // Clear existing timer
  if (pending.timerId) {
    clearTimeout(pending.timerId);
    pending.timerId = null;
  }
  
  // Add to flush queue and process
  flushQueue.push({ targetKey: key, pending });
  processQueue();
}

/**
 * Enqueue a settings write.
 * 
 * Returns a promise that resolves when the write completes.
 * Multiple writes to the same target within the debounce window are merged.
 * 
 * @param write - The write to enqueue
 * @param mode - 'debounced' (default) waits for debounce window; 'immediate' flushes now
 */
export function enqueueSettingsWrite(
  write: QueuedWrite,
  mode: 'debounced' | 'immediate' = 'debounced'
): Promise<unknown> {
  const key = targetKey(write);

  return new Promise((resolve, reject) => {
    if (write.signal?.aborted) {
      reject(createAbortError());
      return;
    }

    const existing = pendingByTarget.get(key);

    if (existing) {
      // Merge with existing pending write
      existing.write.patch = shallowMergePatch(existing.write.patch, write.patch);
      if (write.signal) {
        existing.write.signal = write.signal;
      }
      existing.resolvers.push({ resolve, reject });

      if (mode === 'immediate') {
        // Cancel debounce timer and flush now
        scheduleFlush(key, existing);
      }
      // else: existing timer will handle it
      
    } else {
      // Create new pending write
      const pending: PendingWrite = {
        write: { ...write, patch: { ...write.patch } },
        resolvers: [{ resolve, reject }],
        timerId: null,
        enqueuedAt: Date.now(),
      };

      pendingByTarget.set(key, pending);

      if (mode === 'immediate') {
        scheduleFlush(key, pending);
      } else {
        // Set debounce timer
        pending.timerId = setTimeout(() => {
          scheduleFlush(key, pending);
        }, DEBOUNCE_MS);
      }
    }
  });
}


/**
 * Flush all pending writes immediately.
 * Best-effort: returns without waiting.
 */
function flushAll(): void {
  for (const [key, pending] of pendingByTarget.entries()) {
    if (pending.timerId) {
      clearTimeout(pending.timerId);
      pending.timerId = null;
    }
    flushQueue.push({ targetKey: key, pending });
  }
  pendingByTarget.clear();
  processQueue();
}

// Best-effort flush on page unload and tab hide
// Mobile browsers don't reliably fire beforeunload (e.g., tab switching on iOS Safari),
// so we also flush on visibilitychange to prevent losing pending writes.
if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    flushAll();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      flushAll();
    }
  });
}
