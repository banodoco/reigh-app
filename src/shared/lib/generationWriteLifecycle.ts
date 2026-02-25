import {
  runSerializedTimelineWrite,
  runTimelineWriteWithTimeout,
  type TimelineWriteEventHandler,
} from '@/shared/lib/timelineWriteQueue';

interface RunGenerationWriteLifecycleOptions {
  shotId: string;
  operation: string;
  timeoutOperation: string;
  runWrite: (signal: AbortSignal) => Promise<void>;
  runInvalidation: () => Promise<void>;
  onQueueEvent?: TimelineWriteEventHandler;
  onTimeout?: (meta: { operation: string; timeoutMs: number; pendingMs: number }) => void;
}

/**
 * Shared write lifecycle for timeline/generation mutations.
 * Keeps queueing, timeout handling, and invalidation sequencing consistent.
 */
export async function runGenerationWriteLifecycle(
  options: RunGenerationWriteLifecycleOptions,
): Promise<void> {
  const {
    shotId,
    operation,
    timeoutOperation,
    runWrite,
    runInvalidation,
    onQueueEvent,
    onTimeout,
  } = options;

  await runSerializedTimelineWrite(
    shotId,
    operation,
    async () => {
      await runTimelineWriteWithTimeout(
        timeoutOperation,
        runWrite,
        { onTimeout },
      );
      await runInvalidation();
    },
    onQueueEvent,
  );
}

