/**
 * Timeline Frame Updates
 *
 * This hook serves the BATCH EDITOR path: the user drags an image to a new
 * slot in the image grid and the reorder persists DB-first, with the UI
 * updating via React Query cache refetch once the write completes.
 *
 * The TIMELINE DRAG path (dragging nodes on the ruler) is handled by
 * useTimelinePositions, which applies positions optimistically and guards
 * them with pendingUpdatesRef across async syncs.
 *
 * Both paths share the same serialization queue (runSerializedTimelineWrite)
 * and the same RPC (persistTimelineFrameBatch) so their writes are ordered.
 *
 * Operations:
 * - updateTimelineFrame: single frame update (e.g. typing a frame number)
 * - batchExchangePositions: swap a set of items into absolute frame slots
 * - moveItemsToMidpoint: insert item(s) between neighbors (batch drag)
 */

import { useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ShotGeneration } from '@/shared/hooks/useTimelineCore';
import { queryKeys } from '@/shared/lib/queryKeys';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import {
  isTimelineWriteTimeoutError,
  runSerializedTimelineWrite,
  runTimelineWriteWithTimeout,
} from '@/shared/lib/timelineWriteQueue';
import {
  findGeneration,
  calculateDistributedFrames,
  deduplicateUpdates,
  buildAndNormalizeFinalPositions,
} from './timelineFrameCalculators';
import { persistTimelineFrameBatch } from '@/shared/lib/timelineFrameBatchPersist';

const TIMELINE_FRAME_LOG_PREFIX = '[TimelineFramePersist]';
const log = (...args: Parameters<typeof console.log>) => console.log(...args);

function shortId(value: string | null | undefined): string | null {
  return value ? value.slice(0, 8) : null;
}

// ============================================================================
// Types
// ============================================================================

interface UseTimelineFrameUpdatesOptions {
  shotId: string | null;
  projectId?: string | null;
  shotGenerations: ShotGeneration[];
  syncShotData: (generationId: string, targetShotId: string, frame: number) => Promise<void>;
}

// ============================================================================
// Cache refetch helper
// ============================================================================

function refetchRelatedCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  shotId: string,
  projectId?: string | null
) {
  queryClient.refetchQueries({ queryKey: queryKeys.generations.byShot(shotId) });
  queryClient.refetchQueries({ queryKey: queryKeys.generations.meta(shotId) });
  if (projectId) {
    queryClient.refetchQueries({ queryKey: queryKeys.shots.list(projectId!) });
  }
}

// ============================================================================
// Hook
// ============================================================================

export function useTimelineFrameUpdates({
  shotId,
  projectId,
  shotGenerations,
  syncShotData,
}: UseTimelineFrameUpdatesOptions) {
  const queryClient = useQueryClient();

  // Always-current ref for shotGenerations. Set during render (not in a
  // useEffect) so that any queued task that was blocked behind a slow write
  // reads the up-to-date DB state when it actually executes rather than the
  // stale snapshot captured when it was enqueued.
  const shotGenerationsRef = useRef(shotGenerations);
  shotGenerationsRef.current = shotGenerations;

  const logQueuePhase = useCallback((
    phase: 'queued' | 'start' | 'end',
    meta: {
      shotId: string;
      operation: string;
      waitMs: number;
      durationMs: number;
      queueDepth: number;
      requestId: number;
      blockedByOperation?: string | null;
      blockedByDurationMs?: number | null;
    },
  ) => {
    if (phase === 'queued') {
      log(`${TIMELINE_FRAME_LOG_PREFIX} write queue queued`, {
        shotId: shortId(meta.shotId),
        requestId: meta.requestId,
        operation: meta.operation,
        waitMs: meta.waitMs,
        durationMs: meta.durationMs,
        queueDepth: meta.queueDepth,
        blockedByOperation: meta.blockedByOperation ?? null,
        blockedByDurationMs: meta.blockedByDurationMs ?? null,
      });
      return;
    }

    if (phase === 'start') {
      log(`${TIMELINE_FRAME_LOG_PREFIX} write queue start`, {
        shotId: shortId(meta.shotId),
        requestId: meta.requestId,
        operation: meta.operation,
        waitMs: meta.waitMs,
        queueDepth: meta.queueDepth,
        blockedByOperation: meta.blockedByOperation ?? null,
        blockedByDurationMs: meta.blockedByDurationMs ?? null,
      });
      return;
    }

    log(`${TIMELINE_FRAME_LOG_PREFIX} write queue end`, {
      shotId: shortId(meta.shotId),
      requestId: meta.requestId,
      operation: meta.operation,
      waitMs: meta.waitMs,
      durationMs: meta.durationMs,
      queueDepth: meta.queueDepth,
      blockedByOperation: meta.blockedByOperation ?? null,
      blockedByDurationMs: meta.blockedByDurationMs ?? null,
    });
  }, []);

  /**
   * Update timeline frame for a single generation
   */
  const updateTimelineFrame = useCallback(async (shotGenerationId: string, frame: number) => {
    if (!shotId) {
      throw new Error('No shotId provided');
    }

    await runSerializedTimelineWrite(
      shotId,
      'timeline-frame-single-update',
      async () => {

        const live = shotGenerationsRef.current;
        const shotGen = live.find((sg) => sg.id === shotGenerationId)
          ?? live.find((sg) => sg.generation_id === shotGenerationId);
        if (!shotGen?.id) {
          handleError(new Error(`Shot generation not found for ${shotGenerationId}`), {
            context: 'TimelineFrameUpdates:updateTimelineFrame',
            showToast: false,
          });
          throw new Error(`Shot generation not found for ${shotGenerationId}`);
        }

        await runTimelineWriteWithTimeout(
          'timeline-frame-single-update-write',
          async (signal) => {
            const query = supabase
              .from('shot_generations')
              .update({ timeline_frame: frame })
              .eq('id', shotGen.id)
              .eq('shot_id', shotId);
            const request = 'abortSignal' in query
              ? query.abortSignal(signal)
              : query;
            const { error } = await request;
            if (error) {
              throw error;
            }
          },
          {
            onTimeout: ({ pendingMs, timeoutMs }) => {
              log(`${TIMELINE_FRAME_LOG_PREFIX} updateTimelineFrame timed out`, {
                shotId: shortId(shotId),
                shotGenerationId: shortId(shotGen.id),
                targetFrame: frame,
                timeoutMs,
                pendingMs,
              });
            },
          },
        );

        if (shotGen.generation_id) {
          await syncShotData(shotGen.generation_id, shotId, frame);
        }

        refetchRelatedCaches(queryClient, shotId, projectId);
      },
      logQueuePhase,
    );
  }, [shotId, queryClient, projectId, syncShotData, logQueuePhase]);

  /**
   * Persist absolute frame updates for one or more shot_generations.
   * Uses a single RPC write so reorders are atomic and easier to reason about.
   */
  const batchExchangePositions = useCallback(async (
    updates: Array<{ shotGenerationId: string; newFrame: number }>
  ) => {
    if (!shotId) {
      throw new Error('No shotId provided');
    }

    await runSerializedTimelineWrite(
      shotId,
      'timeline-frame-batch-exchange',
      async () => {

        try {
          if (updates.length === 0) {
            return;
          }

          const canonicalUpdates = updates
            .map(({ shotGenerationId, newFrame }) => {
              const shotGen = shotGenerationsRef.current.find((sg) => sg.id === shotGenerationId);
              if (!shotGen?.id) {
                return null;
              }
              return {
                shotGenerationId: shotGen.id,
                generationId: shotGen.generation_id,
                newFrame,
              };
            })
            .filter((update): update is { shotGenerationId: string; generationId: string; newFrame: number } => update !== null);

          if (canonicalUpdates.length === 0) {
            return;
          }

          await persistTimelineFrameBatch({
            shotId,
            updates: canonicalUpdates.map(({ shotGenerationId, newFrame }) => ({
              shotGenerationId,
              timelineFrame: newFrame,
              metadata: {
                user_positioned: true,
                drag_source: 'batch-exchange',
              },
            })),
            operationLabel: 'timeline-frame-batch-exchange',
            timeoutOperationName: 'timeline-frame-batch-rpc',
            logPrefix: TIMELINE_FRAME_LOG_PREFIX,
            log,
          });

          const syncTargets = canonicalUpdates.filter((update) => !!update.generationId);
          if (syncTargets.length > 0) {
            try {
              await runTimelineWriteWithTimeout(
                'timeline-frame-sync-shot-data',
                async () => {
                  await Promise.all(
                    syncTargets.map(({ generationId, newFrame }) => syncShotData(generationId, shotId, newFrame))
                  );
                },
                {
                  timeoutMs: 10_000,
                  onTimeout: ({ pendingMs, timeoutMs }) => {
                    log(`${TIMELINE_FRAME_LOG_PREFIX} shot_data sync timed out`, {
                      shotId: shortId(shotId),
                      syncCount: syncTargets.length,
                      timeoutMs,
                      pendingMs,
                    });
                  },
                },
              );
            } catch (error) {
              if (isTimelineWriteTimeoutError(error)) {
                log(`${TIMELINE_FRAME_LOG_PREFIX} shot_data sync timeout ignored`, {
                  shotId: shortId(shotId),
                  syncCount: syncTargets.length,
                });
              } else {
                throw error;
              }
            }
          }

          refetchRelatedCaches(queryClient, shotId, projectId);
          queryClient.refetchQueries({ queryKey: queryKeys.segments.liveTimeline(shotId) });
          log(`${TIMELINE_FRAME_LOG_PREFIX} batchExchange cache refetch triggered`, {
            shotId: shortId(shotId),
            changedCount: canonicalUpdates.length,
            byShot: queryKeys.generations.byShot(shotId),
          });
        } catch (error) {
          log(`${TIMELINE_FRAME_LOG_PREFIX} batchExchangePositions failed`, {
            shotId: shortId(shotId),
            updateCount: updates.length,
            error,
          });
          throw error;
        }
      },
      logQueuePhase,
    );
  }, [shotId, queryClient, projectId, syncShotData, logQueuePhase]);

  /**
   * Move items to distributed positions between neighbors (for batch mode drag).
   * Supports both single and multi-item moves.
   */
  const moveItemsToMidpoint = useCallback(async (
    draggedItemIds: string[],
    newStartIndex: number,
    allItems: Array<{ id: string; timeline_frame: number | null }>
  ) => {
    if (!shotId) {
      throw new Error('No shotId provided');
    }

    await runSerializedTimelineWrite(
      shotId,
      'timeline-frame-midpoint-move',
      async () => {

        // Read the latest shotGenerations at execution time, not at enqueue
        // time — this task may have waited in queue behind a slow write.
        const liveShotGenerations = shotGenerationsRef.current;

        // Find shot_generation records for all dragged items
        const draggedShotGens = draggedItemIds.map(id => {
          const sg = findGeneration(liveShotGenerations, id);
          if (!sg?.id) {
            throw new Error(`Shot generation not found for ${id}`);
          }
          return sg;
        });

        log(`${TIMELINE_FRAME_LOG_PREFIX} midpoint calc start`, {
          shotId: shortId(shotId),
          draggedCount: draggedItemIds.length,
          allItemCount: allItems.length,
          newStartIndex,
          liveShotGenCount: liveShotGenerations.length,
        });

        // Calculate distributed frames (pure computation)
        const rawUpdates = calculateDistributedFrames({
          draggedShotGens,
          draggedItemIds,
          newStartIndex,
          allItems,
          shotGenerations: liveShotGenerations,
        });

        // Deduplicate, then normalize so the sequence always starts at frame 0.
        // Without normalization, moving the first item (frame 0) later would
        // leave the 0-slot empty because only the moved item gets a new frame
        // assigned — all other items keep their existing DB values unchanged.
        const uniqueUpdates = deduplicateUpdates(rawUpdates);
        const normalizedUpdates = buildAndNormalizeFinalPositions(uniqueUpdates, liveShotGenerations);
        const afterDedupCount = normalizedUpdates.size;

        log(`${TIMELINE_FRAME_LOG_PREFIX} midpoint calc result`, {
          shotId: shortId(shotId),
          rawUpdateCount: rawUpdates.length,
          afterDedupCount,
        });

        const rpcUpdates = Array.from(normalizedUpdates.entries()).map(([id, payload]) => ({
          shotGenerationId: id,
          timelineFrame: payload.newFrame,
          metadata: {
            user_positioned: true,
            drag_source: 'batch-midpoint',
          },
        }));
        const changedUpdates = rpcUpdates.filter((update) => {
          const currentFrame = liveShotGenerations.find((sg) => sg.id === update.shotGenerationId)?.timeline_frame ?? null;
          return currentFrame !== update.timelineFrame;
        });
        if (changedUpdates.length === 0) {
          log(`${TIMELINE_FRAME_LOG_PREFIX} midpoint rpc skipped (no frame changes)`, {
            shotId: shortId(shotId),
            candidateCount: rpcUpdates.length,
          });
          return;
        }

        log(`${TIMELINE_FRAME_LOG_PREFIX} midpoint persisting`, {
          shotId: shortId(shotId),
          changedCount: changedUpdates.length,
          unchangedCount: rpcUpdates.length - changedUpdates.length,
          updates: changedUpdates.map(u => `${shortId(u.shotGenerationId)}→${u.timelineFrame}`).join(', '),
        });

        try {
          await persistTimelineFrameBatch({
            shotId,
            updates: changedUpdates,
            operationLabel: 'timeline-frame-midpoint-move',
            timeoutOperationName: 'timeline-frame-midpoint-rpc',
            logPrefix: TIMELINE_FRAME_LOG_PREFIX,
            log,
          });
        } catch (error) {
          log(`${TIMELINE_FRAME_LOG_PREFIX} midpoint persist failed`, {
            shotId: shortId(shotId),
            changedCount: changedUpdates.length,
            errorCode: (error as { code?: string }).code ?? null,
            errorMessage: (error as Error).message ?? null,
          });
          throw error;
        }

        refetchRelatedCaches(queryClient, shotId, projectId);
        // CRITICAL: Also refetch segment-live-timeline so segment videos update positions
        queryClient.refetchQueries({ queryKey: queryKeys.segments.liveTimeline(shotId) });
        log(`${TIMELINE_FRAME_LOG_PREFIX} midpoint cache refetch triggered`, {
          shotId: shortId(shotId),
          changedCount: changedUpdates.length,
          byShot: queryKeys.generations.byShot(shotId),
        });
      },
      logQueuePhase,
    );
  }, [shotId, queryClient, projectId, logQueuePhase]);

  return {
    updateTimelineFrame,
    batchExchangePositions,
    moveItemsToMidpoint,
  };
}
