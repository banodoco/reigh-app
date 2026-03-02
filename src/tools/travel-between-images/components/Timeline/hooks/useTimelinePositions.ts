/**
 * useTimelinePositions - Single Source of Truth for Timeline Positions
 *
 * This hook serves the TIMELINE DRAG path: the user drags a node on the
 * timeline ruler and positions update optimistically while the RPC runs.
 *
 * The BATCH EDITOR path (drag-to-reorder in the image grid) is handled
 * separately by useTimelineFrameUpdates, which does a DB-first write and
 * relies on the React Query cache refetch to update the UI. The two paths
 * share the same serialization queue (runSerializedTimelineWrite) and the
 * same RPC (persistTimelineFrameBatch) so their writes are ordered correctly.
 *
 * State machine:
 * - ONE positions map (no displayPositions, stablePositions, framePositions confusion)
 * - Optimistic updates with rollback on error
 * - pendingUpdatesRef protects optimistic state across async DB syncs
 * - Batch database operations for performance
 */

import {
  useState,
  useCallback,
  useRef,
  useEffect
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { GenerationRow } from '@/domains/generation/types';
import { quantizePositions, TRAILING_ENDPOINT_KEY } from '../utils/timeline-utils';
import { useInvalidateGenerations } from '@/shared/hooks/invalidation/useGenerationInvalidation';
import {
  isTimelineWriteTimeoutError,
  isTimelineWriteActive,
} from '@/shared/lib/timelineWriteQueue';
import { persistTimelineFrameBatch } from '@/shared/lib/timelineFrameBatchPersist';
import {
  buildServerPositions,
  createPositionsSyncKey,
  detectPositionChanges,
  hasDuplicatePositionValues,
  mergePendingUpdates,
  type PendingUpdate,
} from './timelinePositionCalc';
import {
  clearTrailingEndpointFrame,
  setTrailingEndpointFrame,
} from './timelineTrailingEndpointPersistence';

// ============================================================================
// TYPES
// ============================================================================

/**
 * State machine for position management
 */
type PositionStatus = 
  | { type: 'idle' }
  | { type: 'updating'; operationId: string; description: string }
  | { type: 'error'; message: string; canRetry: boolean };

interface UseTimelinePositionsProps {
  shotId: string | null;
  shotGenerations: GenerationRow[];
  frameSpacing?: number;
  onPositionsChange?: (positions: Map<string, number>) => void;
}

interface UseTimelinePositionsReturn {
  // The single source of truth for positions
  positions: Map<string, number>;

  // Status for UI feedback
  status: PositionStatus;
  isUpdating: boolean;
  isIdle: boolean;

  // Core operations
  updatePositions: (newPositions: Map<string, number>, options?: UpdateOptions) => Promise<void>;
  addItemsAtPositions: (items: Array<{ id: string; position: number }>) => () => void;
  removeItems: (ids: string[]) => () => void;

  /**
   * Apply optimistic visual update immediately without entering the write queue
   * or touching the DB. Returns a rollback function (or null if nothing changed).
   * Intended to be called BEFORE runSerializedTimelineWrite, with the returned
   * rollback passed as UpdateOptions.externalRollback so updatePositions can
   * roll back on DB error.
   */
  applyOptimisticPositionUpdate: (newPositions: Map<string, number>) => (() => void) | null;

  // Sync control
  syncFromDatabase: () => void;
  lockPositions: () => void;
  unlockPositions: () => void;

  // Helpers
  getPosition: (id: string) => number | undefined;
  hasPosition: (id: string) => boolean;
  hasPendingUpdate: (id: string) => boolean;

  // For backwards compatibility during migration
  displayPositions: Map<string, number>;
  framePositions: Map<string, number>;
  setFramePositions: (positions: Map<string, number>) => Promise<void>;
}

interface UpdateOptions {
  operation?: 'drag' | 'drop' | 'reorder' | 'reset';
  skipOptimistic?: boolean;
  skipDatabase?: boolean;
  metadata?: Record<string, unknown>;
  /**
   * When optimistic update was applied externally (before the write queue),
   * pass its rollback function here so updatePositions can roll back on error.
   */
  externalRollback?: (() => void) | null;
}

// ============================================================================
// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useTimelinePositions({
  shotId,
  shotGenerations,
  onPositionsChange,
}: UseTimelinePositionsProps): UseTimelinePositionsReturn {

  const _queryClient = useQueryClient();
  const invalidateGenerations = useInvalidateGenerations();
  
  // -------------------------------------------------------------------------
  // STATE
  // -------------------------------------------------------------------------
  
  // The single source of truth for positions
  const [positions, setPositions] = useState<Map<string, number>>(new Map());

  // Ref mirror — lets applyOptimistic and updatePositions read current positions
  // in callbacks without positions being in their dep arrays (which would cause
  // recreation on every drag frame, cascading through the entire call chain).
  const positionsRef = useRef<Map<string, number>>(new Map());
  positionsRef.current = positions;

  // State machine status
  const [status, setStatus] = useState<PositionStatus>({ type: 'idle' });
  
  // -------------------------------------------------------------------------
  // REFS
  // -------------------------------------------------------------------------
  
  // Track pending updates for rollback support
  const pendingUpdatesRef = useRef<Map<string, PendingUpdate>>(new Map());

  // Operation counter for tracking concurrent operations
  const operationIdRef = useRef(0);

  // Snapshot for rollback on error
  const snapshotRef = useRef<Map<string, number> | null>(null);

  // Track the last sync to prevent redundant updates
  const lastSyncRef = useRef<string>('');

  // Refs that mirror isLocked/status for syncFromDatabase to read without
  // being in its useCallback deps (changing these must NOT recreate the
  // callback, which would spuriously re-run the sync useEffect with stale
  // shotGenerations before the invalidation refetch returns).
  const isLockedRef = useRef(false);
  const isUpdatingRef = useRef(false);

  // Count of in-flight DB writes (incremented synchronously by applyOptimistic,
  // decremented in the updatePositions finally block). Acts as a hard guard in
  // syncFromDatabase: even if isLockedRef/isUpdatingRef are mysteriously cleared
  // by a race condition, this counter prevents old server data from overwriting
  // in-flight optimistic positions.
  const writeInFlightRef = useRef(0);

  // -------------------------------------------------------------------------
  // LIFECYCLE + POSITIONS-CHANGE AUDIT
  // -------------------------------------------------------------------------

  // -------------------------------------------------------------------------
  // DATABASE SYNC
  // -------------------------------------------------------------------------

  /**
   * Sync positions from database data
   * Only updates if we're idle and data has changed
   */
  const syncFromDatabase = useCallback(() => {
    // Use refs so that toggling the lock/status does NOT recreate this callback
    // (which would cause the useEffect below to fire with stale shotGenerations).
    if (isLockedRef.current) {
      return;
    }

    if (isUpdatingRef.current) {
      return;
    }

    // Hard guard: block any sync while a DB write is in flight, even if the
    // lock refs are somehow cleared by a race. writeInFlightRef is incremented
    // synchronously by applyOptimistic and decremented only in the finally block.
    if (writeInFlightRef.current > 0) {
      return;
    }

    // Cross-path guard: suppress sync while ANY serialized write is active for
    // this shot — including writes from the batch editor (useTimelineFrameUpdates),
    // which does not set isLockedRef. Without this check, a background refetch
    // fired during a slow midpoint RPC would apply stale positions and snap the
    // timeline ruler back before the write completes.
    //
    // CRITICAL: Only suppress if we already have positions loaded (positionsRef.current.size > 0).
    // On initial mount the positions map is empty — there is nothing to protect,
    // and suppressing here leaves the timeline blank for the entire duration of
    // any concurrent batch editor write.
    if (shotId && isTimelineWriteActive(shotId) && positionsRef.current.size > 0) {
      return;
    }

    const serverPositions = buildServerPositions(shotGenerations);
    const { merged: mergedPositions, idsToClear } = mergePendingUpdates(serverPositions, pendingUpdatesRef.current);
    if (idsToClear.length > 0) {
      idsToClear.forEach(id => pendingUpdatesRef.current.delete(id));
    }

    // Check if positions actually changed
    const syncKey = createPositionsSyncKey(mergedPositions);
    if (syncKey === lastSyncRef.current) {
      return; // No change
    }
    lastSyncRef.current = syncKey;

    // Sync positions immediately (not in transition) to prevent flicker
    // when new items are added - the position must be available before render
    setPositions(mergedPositions);

    // Notify parent if callback provided
    if (onPositionsChange) {
      onPositionsChange(mergedPositions);
    }

  }, [shotGenerations, onPositionsChange, shotId]);
  
  // Auto-sync when shot generations change
  useEffect(() => {
    if (shotId && shotGenerations.length > 0) {
      syncFromDatabase();
    }
  }, [shotId, shotGenerations, syncFromDatabase]);
  
  // -------------------------------------------------------------------------
  // OPTIMISTIC UPDATE HELPERS
  // -------------------------------------------------------------------------
  
  /**
   * Apply optimistic update immediately and return a rollback function
   */
  const applyOptimistic = useCallback((
    updates: Array<{ id: string; position: number; operation: 'add' | 'move' | 'remove' }>
  ): (() => void) => {

    // Take snapshot for rollback
    snapshotRef.current = new Map(positionsRef.current);

    // CRITICAL: Populate pendingUpdatesRef SYNCHRONOUSLY before setPositions.
    // React state updaters run asynchronously (deferred in concurrent mode), so
    // putting side effects inside them creates a race: syncFromDatabase can fire
    // between setPositions() and the updater running, seeing pendingCount: 0 and
    // overwriting optimistic state with stale server data.
    const now = Date.now();
    updates.forEach(({ id, position, operation }) => {
      pendingUpdatesRef.current.set(id, {
        id,
        oldPosition: positionsRef.current.get(id) ?? null,
        newPosition: position,
        operation,
        timestamp: now,
      });
    });

    // Apply updates immediately (pure state update — no side effects inside)
    setPositions(current => {
      const next = new Map(current);
      updates.forEach(({ id, position, operation }) => {
        if (operation === 'remove') {
          next.delete(id);
        } else {
          next.set(id, position);
        }
      });
      return next;
    });

    // Return rollback function
    return () => {
      if (snapshotRef.current) {
        setPositions(snapshotRef.current);
        snapshotRef.current = null;
      }
      updates.forEach(({ id }) => {
        pendingUpdatesRef.current.delete(id);
      });
    };

  }, []);

  /**
   * Clear pending updates after successful database write
   */
  const clearPendingUpdates = useCallback((ids: string[]) => {
    ids.forEach(id => pendingUpdatesRef.current.delete(id));
    snapshotRef.current = null;
  }, []);
  
  // -------------------------------------------------------------------------
  // CORE OPERATIONS
  // -------------------------------------------------------------------------
  
  /**
   * Update positions with optimistic UI and database persistence
   * This is the main entry point for position changes
   * NOTE: Positions are automatically quantized to ensure 4N+1 gaps for Wan model compatibility
   */
  const updatePositions = useCallback(async (
    newPositions: Map<string, number>,
    options: UpdateOptions = {}
  ) => {
    const {
      operation = 'reorder',
      skipOptimistic = false,
      skipDatabase = false,
      metadata = {},
      externalRollback,
    } = options;

    if (!shotId) {
      return;
    }

    // Drag/tap paths already quantize in timeline utils; re-quantizing here can
    // rewrite the full timeline and unnecessarily inflate persisted update count.
    const shouldQuantize = operation !== 'drag';
    const quantizedPositions = shouldQuantize ? quantizePositions(newPositions) : new Map(newPositions);

    const operationId = `op-${++operationIdRef.current}-${operation}`;

    // Calculate what changed (using quantized positions).
    // When skipOptimistic=true an external caller already applied the optimistic
    // update before this function runs, so positionsRef.current already reflects
    // the new positions. Use the pre-optimistic snapshot (set synchronously by
    // applyOptimistic) to correctly compute the diff; otherwise changes.length===0
    // and the DB write is skipped entirely.
    const basePositions =
      skipOptimistic && snapshotRef.current ? snapshotRef.current : positionsRef.current;
    const changes = detectPositionChanges(basePositions, quantizedPositions);

    // Detect trailing endpoint removal (was in old positions, not in new)
    const trailingRemoved = positionsRef.current.has(TRAILING_ENDPOINT_KEY) && !quantizedPositions.has(TRAILING_ENDPOINT_KEY);

    if (changes.length === 0 && !trailingRemoved) {
      return;
    }

    // Validate: no duplicate positions
    if (hasDuplicatePositionValues(quantizedPositions)) {
      toast.error('Position conflict detected - operation cancelled');
      return;
    }
    
    // Apply optimistic update.
    // When skipOptimistic=true, the caller already applied the optimistic update
    // externally (before entering the write queue) for instant visual feedback.
    // In that case we reuse the caller's rollback function so errors still revert.
    let rollback: (() => void) | null = null;
    if (!skipOptimistic) {
      const optimisticUpdates = changes.map(c => ({
        id: c.id,
        position: c.newPos,
        operation: (c.oldPos === null ? 'add' : 'move') as 'add' | 'move' | 'remove',
      }));
      if (trailingRemoved) {
        optimisticUpdates.push({
          id: TRAILING_ENDPOINT_KEY,
          position: 0,
          operation: 'remove',
        });
      }
      rollback = applyOptimistic(optimisticUpdates);
    } else if (externalRollback !== undefined) {
      rollback = externalRollback;
    }
    
    // If skipping database, we're done
    if (skipDatabase) {
      clearPendingUpdates(changes.map(c => c.id));
      return;
    }
    
    // Mark a DB write in flight BEFORE the try block so the finally block always
    // decrements it. This counter is the hard guard in syncFromDatabase — even if
    // isLockedRef/isUpdatingRef are mysteriously cleared, writeInFlightRef > 0
    // blocks any sync from applying stale server data over our optimistic state.
    writeInFlightRef.current++;

    // Set status to updating
    isUpdatingRef.current = true;
    setStatus({
      type: 'updating',
      operationId,
      description: `${operation}: ${changes.length} items`,
    });

    // Lock positions to prevent sync interference
    isLockedRef.current = true;

    try {
      // Partition changes: trailing endpoint vs. normal images
      const trailingChange = changes.find(c => c.id === TRAILING_ENDPOINT_KEY);
      const imageChanges = changes.filter(c => c.id !== TRAILING_ENDPOINT_KEY);

      // Build database updates for normal image changes
      const dbUpdates: Array<{ shot_generation_id: string; timeline_frame: number }> = [];
      const unmatchedChangeIds: string[] = [];

      for (const change of imageChanges) {
        // Find the shot_generation record for this item
        // change.id is shot_generations.id which matches sg.id directly
        const shotGen = shotGenerations.find(sg => {
          // Direct match on shot_generations.id
          return sg.id === change.id;
        });

        if (shotGen) {
          dbUpdates.push({
            shot_generation_id: shotGen.id,
            timeline_frame: change.newPos
          });
        } else {
          unmatchedChangeIds.push(change.id);
        }
      }

      if (trailingChange) {
        await setTrailingEndpointFrame(
          {
            shotId,
            operationId,
            shotGenerations,
            logPrefix: '',
            log: () => {},
          },
          trailingChange.newPos,
        );
      }

      if (trailingRemoved) {
        await clearTrailingEndpointFrame({
          shotId,
          operationId,
          shotGenerations,
          logPrefix: '',
          log: () => {},
        });
      }

      if (dbUpdates.length === 0 && !trailingChange && !trailingRemoved) {
        clearPendingUpdates(changes.map(c => c.id));
        return;
      }

      // Batch-update normal image positions (skip if only trailing changed)
      if (dbUpdates.length > 0) {
        try {
          await persistTimelineFrameBatch({
            shotId,
            updates: dbUpdates.map((update) => ({
              shotGenerationId: update.shot_generation_id,
              timelineFrame: update.timeline_frame,
              metadata: {
                user_positioned: true,
                drag_source: operation,
                ...metadata,
              },
            })),
            operationLabel: `timeline-positions-${operation}`,
            timeoutOperationName: 'timeline-positions-batch-rpc',
            logPrefix: '',
            log: () => {},
          });
        } catch (rpcError) {
          throw rpcError;
        }
      }
      
      // Success!
      // NOTE: We do NOT clear pending updates here anymore.
      // We leave them in pendingUpdatesRef until syncFromDatabase verifies that
      // the server data has actually caught up. This prevents "flash of stale content".
      // clearPendingUpdates(changes.map(c => c.id));
      
      // Invalidate cache after a short delay to allow UI to settle
      invalidateGenerations(shotId, {
        reason: 'timeline-position-batch-persist',
        scope: 'images',
        delayMs: 100
      });
      
    } catch (error) {
      const isTimeout = isTimelineWriteTimeoutError(error);
      normalizeAndPresentError(error, { context: 'TimelinePositions', showToast: false, logData: { operationId } });

      // Rollback optimistic update
      if (rollback) {
        rollback();
      }

      setStatus({
        type: 'error',
        message: (error as Error).message,
        canRetry: true
      });

      toast.error('Failed to update positions');
      throw error;

    } finally {
      // Decrement write-in-flight counter (incremented before the try block).
      // Must happen before unlocking so syncFromDatabase stays blocked until
      // both the counter AND the lock are cleared.
      writeInFlightRef.current = Math.max(0, writeInFlightRef.current - 1);

      // Unlock positions — clear ref first so syncFromDatabase guards fire
      // correctly before the state re-render triggers the useEffect.
      isLockedRef.current = false;

      // Reset status
      isUpdatingRef.current = false;
      setTimeout(() => {
        setStatus(current =>
          current.type === 'updating' && current.operationId === operationId
            ? { type: 'idle' }
            : current,
        );
      }, 50);
    }
    
  }, [
    shotId,
    shotGenerations,
    applyOptimistic,
    clearPendingUpdates,
    invalidateGenerations,
  ]);
  
  /**
   * Add new items at specific positions (for drops)
   * Returns a rollback function
   */
  const addItemsAtPositions = useCallback((
    items: Array<{ id: string; position: number }>
  ): (() => void) => {
    
    // Apply optimistic update
    const rollback = applyOptimistic(
      items.map(({ id, position }) => ({ 
        id, 
        position, 
        operation: 'add' as const 
      }))
    );
    
    return rollback;
  }, [applyOptimistic]);
  
  /**
   * Remove items from positions (for deletions)
   * Returns a rollback function
   */
  const removeItems = useCallback((ids: string[]): (() => void) => {
    
    // Apply optimistic update
    const rollback = applyOptimistic(
      ids.map(id => ({ 
        id, 
        position: 0, // Position doesn't matter for remove
        operation: 'remove' as const 
      }))
    );
    
    return rollback;
  }, [applyOptimistic]);
  
  // -------------------------------------------------------------------------
  // LOCK CONTROLS
  // -------------------------------------------------------------------------
  
  const lockPositions = useCallback(() => {
    isLockedRef.current = true;
  }, []);

  const unlockPositions = useCallback(() => {
    // Don't release the lock while a write is in progress — the updatePositions
    // finally block owns that lock and will release it. Without this guard, the
    // external isDragInProgress effect in usePositionManagement fires unlockPositions()
    // on drop (after the render that follows the drop event), which races with and
    // overrides the internal lock acquired synchronously by updatePositions.
    if (isUpdatingRef.current) {
      return;
    }
    isLockedRef.current = false;
  }, []);
  
  // -------------------------------------------------------------------------
  // HELPERS
  // -------------------------------------------------------------------------
  
  const getPosition = useCallback((id: string): number | undefined => {
    return positions.get(id);
  }, [positions]);
  
  const hasPosition = useCallback((id: string): boolean => {
    return positions.has(id);
  }, [positions]);
  
  const hasPendingUpdate = useCallback((id: string): boolean => {
    return pendingUpdatesRef.current.has(id);
  }, []);
  
  // -------------------------------------------------------------------------
  // DERIVED STATE
  // -------------------------------------------------------------------------
  
  const isUpdating = status.type === 'updating';
  const isIdle = status.type === 'idle';
  
  // -------------------------------------------------------------------------
  // PRE-QUEUE OPTIMISTIC HELPER
  // -------------------------------------------------------------------------

  /**
   * Apply an optimistic visual update immediately, without entering the write
   * queue or touching the DB. Designed to be called in setFramePositions BEFORE
   * runSerializedTimelineWrite so the user sees the drag result at once, even
   * when the queue is blocked by a concurrent batch-editor RPC.
   *
   * Returns the rollback function from applyOptimistic (null if nothing changed).
   * Pass this as UpdateOptions.externalRollback to the subsequent updatePositions
   * call so errors can revert the visual state.
   *
   * Uses the drag-path rule: no quantization (matches updatePositions 'drag').
   */
  const applyOptimisticPositionUpdate = useCallback((
    newPositions: Map<string, number>,
  ): (() => void) | null => {
    const updates: Array<{ id: string; position: number; operation: 'add' | 'move' | 'remove' }> = [];
    for (const [id, newPos] of newPositions) {
      const oldPos = positionsRef.current.get(id);
      if (oldPos !== newPos) {
        updates.push({
          id,
          position: newPos,
          operation: oldPos === undefined ? 'add' : 'move',
        });
      }
    }
    if (updates.length === 0) return null;
    return applyOptimistic(updates);
  }, [applyOptimistic]);

  // -------------------------------------------------------------------------
  // BACKWARDS COMPATIBILITY
  // -------------------------------------------------------------------------

  // For backwards compatibility, expose the same interface as the old hook
  const setFramePositions = useCallback(async (newPositions: Map<string, number>) => {
    await updatePositions(newPositions, { operation: 'drag' });
  }, [updatePositions]);
  
  // -------------------------------------------------------------------------
  // RETURN
  // -------------------------------------------------------------------------
  
  return {
    // The single source of truth
    positions,

    // Status
    status,
    isUpdating,
    isIdle,

    // Core operations
    updatePositions,
    addItemsAtPositions,
    removeItems,
    applyOptimisticPositionUpdate,

    // Sync control
    syncFromDatabase,
    lockPositions,
    unlockPositions,

    // Helpers
    getPosition,
    hasPosition,
    hasPendingUpdate,

    // Backwards compatibility
    displayPositions: positions,
    framePositions: positions,
    setFramePositions,
  };
}

// Export types
export type { UseTimelinePositionsReturn, UpdateOptions, PositionStatus };
