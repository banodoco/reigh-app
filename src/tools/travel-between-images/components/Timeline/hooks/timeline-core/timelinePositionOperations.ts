import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { GenerationRow } from '@/domains/generation/types';
import { quantizePositions, TRAILING_ENDPOINT_KEY } from '../../utils/timeline-utils';
import { persistTimelineFrameBatch } from '@/shared/lib/timelineFrameBatchPersist';
import {
  detectPositionChanges,
  hasDuplicatePositionValues,
  type PendingUpdate,
} from './timelinePositionCalc';
import {
  clearTrailingEndpointFrame,
  setTrailingEndpointFrame,
} from '../segment/timelineTrailingEndpointPersistence';
import type { PositionStatus, UpdateOptions } from './timelinePositionTypes';

interface UseTimelinePositionOperationsParams {
  shotId: string | null;
  shotGenerations: GenerationRow[];
  setPositions: Dispatch<SetStateAction<Map<string, number>>>;
  positionsRef: MutableRefObject<Map<string, number>>;
  setStatus: Dispatch<SetStateAction<PositionStatus>>;
  pendingUpdatesRef: MutableRefObject<Map<string, PendingUpdate>>;
  operationIdRef: MutableRefObject<number>;
  snapshotRef: MutableRefObject<Map<string, number> | null>;
  isLockedRef: MutableRefObject<boolean>;
  isUpdatingRef: MutableRefObject<boolean>;
  writeInFlightRef: MutableRefObject<number>;
  invalidateGenerations: (shotId: string, options: { reason: string; scope: string; delayMs?: number }) => void;
}

interface TimelinePositionOperations {
  updatePositions: (newPositions: Map<string, number>, options?: UpdateOptions) => Promise<void>;
  addItemsAtPositions: (items: Array<{ id: string; position: number }>) => () => void;
  removeItems: (ids: string[]) => () => void;
  applyOptimisticPositionUpdate: (newPositions: Map<string, number>) => (() => void) | null;
}

export function useTimelinePositionOperations({
  shotId,
  shotGenerations,
  setPositions,
  positionsRef,
  setStatus,
  pendingUpdatesRef,
  operationIdRef,
  snapshotRef,
  isLockedRef,
  isUpdatingRef,
  writeInFlightRef,
  invalidateGenerations,
}: UseTimelinePositionOperationsParams): TimelinePositionOperations {
  /**
   * Apply optimistic update immediately and return a rollback function.
   */
  const applyOptimistic = useCallback((
    updates: Array<{ id: string; position: number; operation: 'add' | 'move' | 'remove' }>,
  ): (() => void) => {
    snapshotRef.current = new Map(positionsRef.current);

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

    return () => {
      if (snapshotRef.current) {
        setPositions(snapshotRef.current);
        snapshotRef.current = null;
      }
      updates.forEach(({ id }) => {
        pendingUpdatesRef.current.delete(id);
      });
    };
  }, [pendingUpdatesRef, positionsRef, setPositions, snapshotRef]);

  /**
   * Clear pending updates after successful database write.
   */
  const clearPendingUpdates = useCallback((ids: string[]) => {
    ids.forEach(id => pendingUpdatesRef.current.delete(id));
    snapshotRef.current = null;
  }, [pendingUpdatesRef, snapshotRef]);

  /**
   * Update positions with optimistic UI and database persistence.
   */
  const updatePositions = useCallback(async (
    newPositions: Map<string, number>,
    options: UpdateOptions = {},
  ) => {
    const {
      operation = 'reorder',
      optimisticAppliedExternally = false,
      skipDatabase = false,
      metadata = {},
      externalRollback,
      signal,
    } = options;

    if (!shotId) {
      return;
    }

    const shouldQuantize = operation !== 'drag';
    const quantizedPositions = shouldQuantize ? quantizePositions(newPositions) : new Map(newPositions);

    const operationId = `op-${++operationIdRef.current}-${operation}`;

    const basePositions =
      optimisticAppliedExternally && snapshotRef.current ? snapshotRef.current : positionsRef.current;
    const changes = detectPositionChanges(basePositions, quantizedPositions);

    const trailingRemoved = positionsRef.current.has(TRAILING_ENDPOINT_KEY) && !quantizedPositions.has(TRAILING_ENDPOINT_KEY);

    if (changes.length === 0 && !trailingRemoved) {
      return;
    }

    if (hasDuplicatePositionValues(quantizedPositions)) {
      toast.error('Position conflict detected - operation cancelled');
      return;
    }

    let rollback: (() => void) | null = null;
    if (!optimisticAppliedExternally) {
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

    if (skipDatabase) {
      clearPendingUpdates(changes.map(c => c.id));
      return;
    }

    writeInFlightRef.current++;

    isUpdatingRef.current = true;
    setStatus({
      type: 'updating',
      operationId,
      description: `${operation}: ${changes.length} items`,
    });

    isLockedRef.current = true;

    try {
      const trailingChange = changes.find(c => c.id === TRAILING_ENDPOINT_KEY);
      const imageChanges = changes.filter(c => c.id !== TRAILING_ENDPOINT_KEY);

      const dbUpdates: Array<{ shot_generation_id: string; timeline_frame: number }> = [];
      for (const change of imageChanges) {
        const shotGen = shotGenerations.find(sg => sg.id === change.id);
        if (shotGen) {
          dbUpdates.push({
            shot_generation_id: shotGen.id,
            timeline_frame: change.newPos,
          });
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
            signal,
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
          signal,
        });
      }

      if (dbUpdates.length === 0 && !trailingChange && !trailingRemoved) {
        clearPendingUpdates(changes.map(c => c.id));
        return;
      }

      if (dbUpdates.length > 0) {
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
          signal,
          logPrefix: '',
          log: () => {},
        });
      }

      invalidateGenerations(shotId, {
        reason: 'timeline-position-batch-persist',
        scope: 'images',
        delayMs: 100,
      });
    } catch (error) {
      normalizeAndPresentError(error, { context: 'TimelinePositions', showToast: false, logData: { operationId } });

      if (rollback) {
        rollback();
      }

      setStatus({
        type: 'error',
        message: (error as Error).message,
        canRetry: true,
      });

      toast.error('Failed to update positions');
      throw error;
    } finally {
      writeInFlightRef.current = Math.max(0, writeInFlightRef.current - 1);
      isLockedRef.current = false;

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
    positionsRef,
    operationIdRef,
    snapshotRef,
    applyOptimistic,
    clearPendingUpdates,
    writeInFlightRef,
    isUpdatingRef,
    setStatus,
    isLockedRef,
    invalidateGenerations,
  ]);

  const addItemsAtPositions = useCallback((
    items: Array<{ id: string; position: number }>,
  ): (() => void) => {
    return applyOptimistic(
      items.map(({ id, position }) => ({
        id,
        position,
        operation: 'add' as const,
      })),
    );
  }, [applyOptimistic]);

  const removeItems = useCallback((ids: string[]): (() => void) => {
    return applyOptimistic(
      ids.map(id => ({
        id,
        position: 0,
        operation: 'remove' as const,
      })),
    );
  }, [applyOptimistic]);

  /**
   * Apply an optimistic visual update immediately, without entering the write
   * queue or touching the DB.
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
  }, [applyOptimistic, positionsRef]);

  return {
    updatePositions,
    addItemsAtPositions,
    removeItems,
    applyOptimisticPositionUpdate,
  };
}
