import { supabase } from '@/integrations/supabase/client';
import { toJson } from '@/shared/lib/supabaseTypeHelpers';
import {
  isTimelineWriteTimeoutError,
  runTimelineWriteWithTimeout,
} from '@/shared/lib/timelineWriteQueue';

interface TimelineFrameBatchUpdate {
  shotGenerationId: string;
  timelineFrame: number;
  metadata?: Record<string, unknown>;
}

interface PersistTimelineFrameBatchOptions {
  shotId: string;
  updates: TimelineFrameBatchUpdate[];
  operationLabel: string;
  timeoutOperationName: string;
  timeoutFloorMs?: number;
  timeoutPerUpdateMs?: number;
  allowSequentialFallback?: boolean;
  logPrefix: string;
  log: (message: string, payload: Record<string, unknown>) => void;
}

interface PersistTimelineFrameBatchResult {
  updateCount: number;
  durationMs: number;
  skipped: boolean;
}

const DEFAULT_TIMEOUT_FLOOR_MS = 30_000;
const DEFAULT_TIMEOUT_PER_UPDATE_MS = 2_000;

function shortId(id: string | null | undefined): string | null {
  return id ? id.slice(0, 8) : null;
}

function dedupeLast(updates: TimelineFrameBatchUpdate[]): TimelineFrameBatchUpdate[] {
  const byId = new Map<string, TimelineFrameBatchUpdate>();
  updates.forEach((update) => {
    byId.set(update.shotGenerationId, update);
  });
  return Array.from(byId.values());
}

function formatUpdateSignature(
  updates: Array<{ shot_generation_id: string; timeline_frame: number }>,
): string {
  return updates
    .map((update) => `${shortId(update.shot_generation_id)}=>${update.timeline_frame}`)
    .join(', ');
}

function getNetworkSnapshot(): Record<string, unknown> {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {};
  }
  const connection = (navigator as Navigator & {
    connection?: {
      effectiveType?: string;
      downlink?: number;
      rtt?: number;
      saveData?: boolean;
    };
  }).connection;
  return {
    online: navigator.onLine,
    visibilityState: typeof document !== 'undefined' ? document.visibilityState : null,
    effectiveType: connection?.effectiveType ?? null,
    downlink: connection?.downlink ?? null,
    rtt: connection?.rtt ?? null,
    saveData: connection?.saveData ?? null,
  };
}

export async function persistTimelineFrameBatch({
  shotId,
  updates,
  operationLabel,
  timeoutOperationName,
  timeoutFloorMs = DEFAULT_TIMEOUT_FLOOR_MS,
  timeoutPerUpdateMs = DEFAULT_TIMEOUT_PER_UPDATE_MS,
  allowSequentialFallback = true,
  logPrefix,
  log,
}: PersistTimelineFrameBatchOptions): Promise<PersistTimelineFrameBatchResult> {
  const canonicalUpdates = dedupeLast(updates);
  if (canonicalUpdates.length === 0) {
    log(`${logPrefix} ${operationLabel} skipped (no updates)`, {
      shotId: shortId(shotId),
      updateCount: 0,
    });
    return {
      updateCount: 0,
      durationMs: 0,
      skipped: true,
    };
  }

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const rpcPayload = canonicalUpdates.map((update) => ({
    shot_generation_id: update.shotGenerationId,
    timeline_frame: update.timelineFrame,
    metadata: update.metadata ?? {},
  }));
  const rpcTimeoutMs = Math.max(timeoutFloorMs, rpcPayload.length * timeoutPerUpdateMs);
  const updateSignature = formatUpdateSignature(rpcPayload);

  // Validate payload before sending — invalid data causes silent hangs
  const validationIssues: string[] = [];
  for (const update of rpcPayload) {
    if (!update.shot_generation_id || !UUID_REGEX.test(update.shot_generation_id)) {
      validationIssues.push(`bad_uuid: "${update.shot_generation_id}"`);
    }
    if (typeof update.timeline_frame !== 'number' || !Number.isInteger(update.timeline_frame) || update.timeline_frame < 0) {
      validationIssues.push(`bad_frame: ${update.shot_generation_id?.slice(0, 8)} → ${update.timeline_frame} (type:${typeof update.timeline_frame})`);
    }
  }

  const startedAt = Date.now();
  log(`${logPrefix} rpc batch_update_timeline_frames start`, {
    shotId: shortId(shotId),
    operation: operationLabel,
    updateCount: rpcPayload.length,
    timeoutMs: rpcTimeoutMs,
    updateSignature,
    network: getNetworkSnapshot(),
  });

  const watchdog = setTimeout(() => {
    log(`${logPrefix} rpc batch_update_timeline_frames still pending`, {
      shotId: shortId(shotId),
      operation: operationLabel,
      updateCount: rpcPayload.length,
      pendingMs: Date.now() - startedAt,
      updateSignature,
      network: getNetworkSnapshot(),
    });
  }, 8000);

  let rpcError: { code?: string; message?: string } | null = null;
  let rpcResultRows: Array<{ shot_generation_id?: string | null; timeline_frame?: number | null }> = [];
  try {
    await runTimelineWriteWithTimeout(
      timeoutOperationName,
      async (signal) => {
        const { data, error } = await supabase
          .rpc('batch_update_timeline_frames', { p_updates: toJson(rpcPayload) })
          .abortSignal(signal);
        if (error) throw error;
        if (Array.isArray(data)) {
          rpcResultRows = data as Array<{ shot_generation_id?: string | null; timeline_frame?: number | null }>;
        } else if (data == null) {
          rpcResultRows = [];
        } else {
          rpcResultRows = [];
          log(`${logPrefix} rpc batch_update_timeline_frames returned unexpected payload`, {
            shotId: shortId(shotId),
            operation: operationLabel,
            updateCount: rpcPayload.length,
            payloadType: typeof data,
          });
        }
      },
      {
        timeoutMs: rpcTimeoutMs,
        onTimeout: ({ pendingMs, timeoutMs }) => {
          log(`${logPrefix} rpc batch_update_timeline_frames timed out`, {
            shotId: shortId(shotId),
            operation: operationLabel,
            updateCount: rpcPayload.length,
            timeoutMs,
            pendingMs,
            updateSignature,
            network: getNetworkSnapshot(),
          });
        },
      },
    );
    log(`${logPrefix} rpc batch_update_timeline_frames returned`, {
      shotId: shortId(shotId),
      operation: operationLabel,
      updateCount: rpcPayload.length,
      durationMs: Date.now() - startedAt,
      errorCode: null,
      errorMessage: null,
      updateSignature,
    });
  } catch (error) {
    rpcError = error as { code?: string; message?: string };
    log(`${logPrefix} rpc batch_update_timeline_frames returned`, {
      shotId: shortId(shotId),
      operation: operationLabel,
      updateCount: rpcPayload.length,
      durationMs: Date.now() - startedAt,
      errorCode: rpcError.code ?? null,
      errorMessage: rpcError.message ?? null,
      updateSignature,
    });
  } finally {
    clearTimeout(watchdog);
  }

  const requestedIds = new Set(rpcPayload.map((update) => update.shot_generation_id));

  if (rpcError) {
    if (isTimelineWriteTimeoutError(rpcError)) {
      try {
        const diagnosticRows = await runTimelineWriteWithTimeout(
          `${timeoutOperationName}-timeout-diagnostics`,
          async (signal) => {
            const { data, error } = await supabase
              .from('shot_generations')
              .select('id, shot_id, generation_id, timeline_frame, updated_at, metadata')
              .in('id', Array.from(requestedIds))
              .abortSignal(signal);
            if (error) throw error;
            return data ?? [];
          },
          { timeoutMs: 5000 },
        );

        log(`${logPrefix} timeout diagnostics snapshot`, {
          shotId: shortId(shotId),
          operation: operationLabel,
          updateSignature,
          requestedCount: requestedIds.size,
          snapshotCount: diagnosticRows.length,
          snapshot: diagnosticRows.map((row) => ({
            shotGenerationId: shortId(row.id),
            shotId: shortId(row.shot_id as string),
            generationId: shortId(row.generation_id as string),
            timelineFrame: row.timeline_frame,
            updatedAt: row.updated_at,
            dragSource: (row.metadata as Record<string, unknown> | null)?.drag_source ?? null,
          })),
        });
      } catch (diagnosticError) {
        log(`${logPrefix} timeout diagnostics failed`, {
          shotId: shortId(shotId),
          operation: operationLabel,
          updateSignature,
          diagnosticError: (diagnosticError as { message?: string })?.message ?? String(diagnosticError),
        });
      }
    }

    if (allowSequentialFallback && rpcError.code === '42883') {
      for (const update of canonicalUpdates) {
        const sequentialStart = Date.now();
        log(`${logPrefix} sequential update start`, {
          shotId: shortId(shotId),
          operation: operationLabel,
          shotGenerationId: shortId(update.shotGenerationId),
          timelineFrame: update.timelineFrame,
        });
        await runTimelineWriteWithTimeout(
          `${timeoutOperationName}-sequential`,
          async (signal) => {
            const { error } = await supabase
              .from('shot_generations')
              .update({
                timeline_frame: update.timelineFrame,
                metadata: (update.metadata ?? {}) as Json,
              })
              .eq('id', update.shotGenerationId)
              .abortSignal(signal);
            if (error) throw error;
          },
          {
            timeoutMs: Math.max(timeoutFloorMs, canonicalUpdates.length * timeoutPerUpdateMs),
          },
        );
        log(`${logPrefix} sequential update succeeded`, {
          shotId: shortId(shotId),
          operation: operationLabel,
          shotGenerationId: shortId(update.shotGenerationId),
          timelineFrame: update.timelineFrame,
          durationMs: Date.now() - sequentialStart,
        });
      }
    } else {
      throw rpcError;
    }
  }

  const returnedIds = new Set(
    rpcResultRows
      .map((row) => row.shot_generation_id)
      .filter((id): id is string => typeof id === 'string' && id.length > 0),
  );
  const missingRequestedIds = Array.from(requestedIds).filter((id) => !returnedIds.has(id));
  if (missingRequestedIds.length > 0 || returnedIds.size !== requestedIds.size) {
    log(`${logPrefix} rpc batch_update_timeline_frames row mismatch`, {
      shotId: shortId(shotId),
      operation: operationLabel,
      requestedCount: requestedIds.size,
      returnedCount: returnedIds.size,
      missingRequestedIds: missingRequestedIds.map((id) => shortId(id)),
      requestedIds: Array.from(requestedIds).map((id) => shortId(id)),
      returnedIds: Array.from(returnedIds).map((id) => shortId(id)),
      updateSignature,
    });
    throw new Error(
      `Timeline batch update mismatch: requested ${requestedIds.size}, updated ${returnedIds.size}`,
    );
  }

  log(`${logPrefix} rpc batch_update_timeline_frames succeeded`, {
    shotId: shortId(shotId),
    operation: operationLabel,
    updateCount: rpcPayload.length,
    returnedFrames: rpcResultRows.slice(0, 8).map((row) => ({
      id: shortId(row.shot_generation_id ?? null),
      frame: row.timeline_frame,
    })),
  });
  return {
    updateCount: rpcPayload.length,
    durationMs: Date.now() - startedAt,
    skipped: false,
  };
}
