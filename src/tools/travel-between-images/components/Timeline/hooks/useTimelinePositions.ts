/**
 * useTimelinePositions - Single Source of Truth for Timeline Positions
 * 
 * This hook replaces the complex multi-source position management with a
 * clean state machine approach:
 * 
 * - ONE positions map (no displayPositions, stablePositions, framePositions confusion)
 * - Proper optimistic updates with rollback on error
 * - Batch database operations for performance
 * - No visible intermediate states (items without positions don't render)
 * 
 * @see https://github.com/your-repo/docs/timeline-refactor.md
 */

import { useState, useCallback, useMemo, useRef, useTransition, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from '@/shared/components/ui/sonner';
import { handleError } from '@/shared/lib/errorHandler';
import { supabase } from '@/integrations/supabase/client';
import type { ShotGeneration } from '@/shared/hooks/useTimelineCore';
import { quantizePositions, TRAILING_ENDPOINT_KEY } from '../utils/timeline-utils';
import { useInvalidateGenerations } from '@/shared/hooks/useGenerationInvalidation';
import { DEFAULT_FRAME_SPACING } from '@/shared/utils/timelinePositionCalculator';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Tracks a pending position update for rollback support
 */
interface PendingUpdate {
  id: string;
  oldPosition: number | null;  // null = new item being added
  newPosition: number;
  operation: 'add' | 'move' | 'remove';
  timestamp: number;
}

/**
 * State machine for position management
 */
type PositionStatus = 
  | { type: 'idle' }
  | { type: 'updating'; operationId: string; description: string }
  | { type: 'error'; message: string; canRetry: boolean };

interface UseTimelinePositionsProps {
  shotId: string | null;
  shotGenerations: ShotGeneration[];
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
}

// ============================================================================
// CONSTANTS
// ============================================================================

const OPERATION_TIMEOUT_MS = 10000; // 10 seconds max for any operation

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useTimelinePositions({
  shotId,
  shotGenerations,
  frameSpacing = DEFAULT_FRAME_SPACING,
  onPositionsChange,
}: UseTimelinePositionsProps): UseTimelinePositionsReturn {
  
  const queryClient = useQueryClient();
  const invalidateGenerations = useInvalidateGenerations();
  const [isPending, startTransition] = useTransition();
  
  // -------------------------------------------------------------------------
  // STATE
  // -------------------------------------------------------------------------
  
  // The single source of truth for positions
  const [positions, setPositions] = useState<Map<string, number>>(new Map());
  
  // State machine status
  const [status, setStatus] = useState<PositionStatus>({ type: 'idle' });
  
  // Lock to prevent database syncs during operations
  const [isLocked, setIsLocked] = useState(false);
  
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
  
  // -------------------------------------------------------------------------
  // DATABASE SYNC
  // -------------------------------------------------------------------------
  
  /**
   * Sync positions from database data
   * Only updates if we're idle and data has changed
   */
  const syncFromDatabase = useCallback(() => {
    // Don't sync if locked
    if (isLocked) {
      console.log('[TimelinePositions] 🔒 Skipping sync - positions locked');
      return;
    }
    
    // Don't sync if we're in the middle of an update
    if (status.type === 'updating') {
      console.log('[TimelinePositions] ⏳ Skipping sync - update in progress');
      return;
    }

    // Calculate positions from shotGenerations (single source of truth)
    // Optimistic items should use addItemsAtPositions() which adds to pendingUpdatesRef
    const newPositions = new Map<string, number>();

    // Add positions from shotGenerations (database source)
    // shotGenerations uses sg.id as the key (shot_generations.id)
    // CRITICAL: Exclude negative values (-1 is used as sentinel for unpositioned)
    shotGenerations.forEach(shotGen => {
      if (shotGen.timeline_frame !== null && shotGen.timeline_frame !== undefined && shotGen.timeline_frame >= 0) {
        newPositions.set(shotGen.id, shotGen.timeline_frame);
      }
    });

    // Add trailing endpoint from last positioned image's metadata.end_frame
    const sortedShotGens = [...shotGenerations]
      .filter(sg => sg.timeline_frame !== null && sg.timeline_frame !== undefined && sg.timeline_frame >= 0)
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
    if (sortedShotGens.length > 0) {
      const lastShotGen = sortedShotGens[sortedShotGens.length - 1];
      const metadata = lastShotGen.metadata as Record<string, unknown> | null;
      const endFrame = metadata?.end_frame;
      if (typeof endFrame === 'number' && endFrame > (lastShotGen.timeline_frame ?? 0)) {
        newPositions.set(TRAILING_ENDPOINT_KEY, endFrame);
      }
    }

    // MERGE LOGIC: Combine server data with local pending updates
    // Instead of skipping the entire sync, we merge:
    // 1. Server data (truth for non-pending items and verified items)
    // 2. Local pending data (truth for unverified pending items)
    if (pendingUpdatesRef.current.size > 0) {
       const now = Date.now();
       const toDelete = new Set<string>();

       for (const [id, pending] of pendingUpdatesRef.current.entries()) {
           const serverPos = newPositions.get(id);
           
           // 1. Success case: Server matches our pending update
           // Use relaxed comparison for safety (sometimes floats vs ints)
           if (serverPos !== undefined && Math.abs(serverPos - pending.newPosition) < 0.01) {
               toDelete.add(id);
               // Server is correct, keep newPositions as-is for this item
               continue;
           }

           // 2. Timeout case: Pending update is too old (> 10s)
           if (now - pending.timestamp > 10000) {
               console.warn('[TimelinePositions] ⏰ Pending update timed out, accepting server state:', id);
               toDelete.add(id);
               // Accept server data (already in newPositions)
               continue;
           }
           
           // 3. Stale case: Server still has old position (or null)
           // OVERRIDE the server data with our local optimistic state
           // This protects the dragged item(s) from jumping back
           if (pending.operation === 'remove') {
               newPositions.delete(id);
           } else {
               newPositions.set(id, pending.newPosition);
           }
           console.log('[TimelinePositions] 🛡️ Protected pending item from stale sync:', {
             id: id.substring(0, 8),
             serverPos,
             localPos: pending.newPosition
           });
       }
       
       // Clear verified/timed-out updates
       if (toDelete.size > 0) {
         console.log('[TimelinePositions] ✅ Verified/Cleared pending updates:', Array.from(toDelete).map(id => id.substring(0, 8)));
         toDelete.forEach(id => pendingUpdatesRef.current.delete(id));
       }
       
       // NOTE: We no longer skip the sync entirely!
       // We merged local pending data into newPositions, so we can safely continue
    }
    
    // Check if positions actually changed
    const syncKey = JSON.stringify([...newPositions.entries()].sort());
    if (syncKey === lastSyncRef.current) {
      return; // No change
    }
    lastSyncRef.current = syncKey;
    
    console.log('[PositionTrace] syncFromDatabase SETTING POSITIONS:', {
      shotId: shotId?.substring(0, 8),
      positionsCount: newPositions.size,
      allPositions: [...newPositions.entries()].map(([id, pos]) => ({
        id: id.substring(0, 8),
        position: pos
      })),
      fromShotGenerationsCount: shotGenerations.length,
      timestamp: Date.now()
    });

    // Sync positions immediately (not in transition) to prevent flicker
    // when new items are added - the position must be available before render
    setPositions(newPositions);

    // Notify parent if callback provided
    if (onPositionsChange) {
      onPositionsChange(newPositions);
    }

  }, [isLocked, status.type, shotGenerations, shotId, onPositionsChange]);
  
  // Auto-sync when shot generations change
  useEffect(() => {
    if (shotId && shotGenerations.length > 0) {
      console.log('[PositionTrace] shotGenerations changed, triggering sync:', {
        shotId: shotId.substring(0, 8),
        count: shotGenerations.length,
        positions: shotGenerations.slice(0, 5).map(sg => ({
          id: sg.id.substring(0, 8),
          frame: sg.timeline_frame
        })),
        timestamp: Date.now()
      });
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
    snapshotRef.current = new Map(positions);
    
    // Apply updates immediately
    setPositions(current => {
      const next = new Map(current);
      
      updates.forEach(({ id, position, operation }) => {
        if (operation === 'remove') {
          next.delete(id);
        } else {
          next.set(id, position);
        }
        
        // Track as pending
        pendingUpdatesRef.current.set(id, {
          id,
          oldPosition: current.get(id) ?? null,
          newPosition: position,
          operation,
          timestamp: Date.now(),
        });
      });
      
      console.log('[TimelinePositions] ✨ Applied optimistic update:', {
        updatesCount: updates.length,
        newPositionsCount: next.size
      });
      
      return next;
    });
    
    // Return rollback function
    return () => {
      console.log('[TimelinePositions] ⏪ Rolling back optimistic update');
      
      if (snapshotRef.current) {
        setPositions(snapshotRef.current);
        snapshotRef.current = null;
      }
      
      updates.forEach(({ id }) => {
        pendingUpdatesRef.current.delete(id);
      });
    };
    
  }, [positions]);
  
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
      metadata = {}
    } = options;
    
    if (!shotId) {
      console.warn('[TimelinePositions] No shotId, skipping update');
      return;
    }
    
    // Quantize positions to ensure 4N+1 gaps for Wan model compatibility
    const quantizedPositions = quantizePositions(newPositions);
    
    const operationId = `op-${++operationIdRef.current}-${operation}`;
    
    console.log(`[TimelinePositions] 🚀 Starting ${operation} operation:`, {
      operationId,
      newPositionsCount: newPositions.size,
      quantizedPositionsCount: quantizedPositions.size,
      quantizationApplied: true
    });
    
    // Calculate what changed (using quantized positions)
    const changes: Array<{ id: string; oldPos: number | null; newPos: number }> = [];

    for (const [id, newPos] of quantizedPositions) {
      const oldPos = positions.get(id);
      if (oldPos !== newPos) {
        changes.push({ id, oldPos: oldPos ?? null, newPos });
      }
    }

    // Detect trailing endpoint removal (was in old positions, not in new)
    const trailingRemoved = positions.has(TRAILING_ENDPOINT_KEY) && !quantizedPositions.has(TRAILING_ENDPOINT_KEY);

    if (changes.length === 0 && !trailingRemoved) {
      console.log('[TimelinePositions] No changes detected, skipping');
      return;
    }
    
    // Validate: no duplicate positions
    const positionValues = [...quantizedPositions.values()];
    const uniquePositions = new Set(positionValues);
    if (uniquePositions.size !== positionValues.length) {
      console.error('[TimelinePositions] ❌ Duplicate positions detected!');
      
      // Find and log duplicates
      const counts = new Map<number, string[]>();
      for (const [id, pos] of quantizedPositions) {
        if (!counts.has(pos)) counts.set(pos, []);
        counts.get(pos)!.push(id);
      }
      const duplicates = [...counts.entries()].filter(([, ids]) => ids.length > 1);
      console.error('[TimelinePositions] Duplicates:', duplicates);
      
      toast.error('Position conflict detected - operation cancelled');
      return;
    }
    
    // Apply optimistic update
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
    }
    
    // If skipping database, we're done
    if (skipDatabase) {
      clearPendingUpdates(changes.map(c => c.id));
      return;
    }
    
    // Set status to updating
    setStatus({ 
      type: 'updating', 
      operationId, 
      description: `${operation}: ${changes.length} items` 
    });
    
    // Lock positions to prevent sync interference
    setIsLocked(true);
    
    try {
      // Partition changes: trailing endpoint vs. normal images
      const trailingChange = changes.find(c => c.id === TRAILING_ENDPOINT_KEY);
      const imageChanges = changes.filter(c => c.id !== TRAILING_ENDPOINT_KEY);

      // Build database updates for normal image changes
      const dbUpdates: Array<{ shot_generation_id: string; timeline_frame: number }> = [];

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
          console.warn('[TimelinePositions] Could not find shot_generation for:',
            change.id.substring(0, 8));
        }
      }

      // Handle trailing endpoint change — write metadata.end_frame on last positioned image
      if (trailingChange) {
        const sortedShotGens = [...shotGenerations]
          .filter(sg => sg.timeline_frame !== null && sg.timeline_frame !== undefined && sg.timeline_frame >= 0)
          .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
        const lastShotGen = sortedShotGens[sortedShotGens.length - 1];
        if (lastShotGen) {
          console.log('[TimelinePositions] 📤 Persisting trailing end_frame:', {
            shotGenId: lastShotGen.id.substring(0, 8),
            endFrame: trailingChange.newPos
          });
          const { data: current, error: fetchError } = await supabase
            .from('shot_generations')
            .select('metadata')
            .eq('id', lastShotGen.id)
            .single();
          if (fetchError) throw fetchError;
          const currentMetadata = (current?.metadata as Record<string, unknown>) || {};
          const { error: updateError } = await supabase
            .from('shot_generations')
            .update({
              metadata: { ...currentMetadata, end_frame: trailingChange.newPos },
            })
            .eq('id', lastShotGen.id);
          if (updateError) throw updateError;
        }
      }

      // Handle trailing endpoint removal — clear metadata.end_frame from last positioned image
      if (trailingRemoved) {
        const sortedShotGens = [...shotGenerations]
          .filter(sg => sg.timeline_frame !== null && sg.timeline_frame !== undefined && sg.timeline_frame >= 0)
          .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
        const lastShotGen = sortedShotGens[sortedShotGens.length - 1];
        if (lastShotGen) {
          console.log('[TimelinePositions] 🗑️ Clearing trailing end_frame:', {
            shotGenId: lastShotGen.id.substring(0, 8),
          });
          const { data: current, error: fetchError } = await supabase
            .from('shot_generations')
            .select('metadata')
            .eq('id', lastShotGen.id)
            .single();
          if (fetchError) throw fetchError;
          const currentMetadata = (current?.metadata as Record<string, unknown>) || {};
          delete currentMetadata.end_frame;
          const { error: updateError } = await supabase
            .from('shot_generations')
            .update({ metadata: currentMetadata })
            .eq('id', lastShotGen.id);
          if (updateError) throw updateError;
        }
      }

      if (dbUpdates.length === 0 && !trailingChange && !trailingRemoved) {
        console.warn('[TimelinePositions] No database updates to perform');
        clearPendingUpdates(changes.map(c => c.id));
        return;
      }

      // Batch-update normal image positions (skip if only trailing changed)
      if (dbUpdates.length > 0) {
        console.log('[TimelinePositions] 📤 Sending batch update to database:', {
          updatesCount: dbUpdates.length
        });

        // Use batch update RPC if available, otherwise fallback to sequential updates
        const { error: rpcError } = await supabase.rpc('batch_update_timeline_frames', {
          p_updates: dbUpdates.map(u => ({
            shot_generation_id: u.shot_generation_id,
            timeline_frame: u.timeline_frame,
            metadata: {
              user_positioned: true,
              drag_source: operation,
              ...metadata
            }
          }))
        });

        if (rpcError) {
          // Fallback to sequential updates if RPC doesn't exist
          if (rpcError.code === '42883') { // function does not exist
            console.warn('[TimelinePositions] batch_update_timeline_frames not found, using sequential updates');

            for (const update of dbUpdates) {
              const { error } = await supabase
                .from('shot_generations')
                .update({
                  timeline_frame: update.timeline_frame,
                  metadata: {
                    user_positioned: true,
                    drag_source: operation,
                    ...metadata
                  }
                })
                .eq('id', update.shot_generation_id);

              if (error) throw error;
            }
          } else {
            throw rpcError;
          }
        }
      }
      
      // Success!
      // NOTE: We do NOT clear pending updates here anymore.
      // We leave them in pendingUpdatesRef until syncFromDatabase verifies that
      // the server data has actually caught up. This prevents "flash of stale content".
      // clearPendingUpdates(changes.map(c => c.id));
      
      console.log(`[TimelinePositions] ✅ Operation ${operationId} completed successfully`);

      // Invalidate cache after a short delay to allow UI to settle
      invalidateGenerations(shotId, {
        reason: 'timeline-position-batch-persist',
        scope: 'all',
        delayMs: 100
      });
      
    } catch (error) {
      handleError(error, { context: 'TimelinePositions', showToast: false, logData: { operationId } });

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
      // Unlock positions
      setIsLocked(false);
      
      // Reset status if this is still the active operation
      setTimeout(() => {
        setStatus(current => 
          current.type === 'updating' && current.operationId === operationId
            ? { type: 'idle' }
            : current
        );
      }, 50);
    }
    
  }, [
    shotId,
    positions,
    shotGenerations,
    applyOptimistic,
    clearPendingUpdates,
    queryClient
  ]);
  
  /**
   * Add new items at specific positions (for drops)
   * Returns a rollback function
   */
  const addItemsAtPositions = useCallback((
    items: Array<{ id: string; position: number }>
  ): (() => void) => {
    console.log('[TimelinePositions] ➕ Adding items at positions:', {
      count: items.length,
      items: items.map(i => ({ id: i.id.substring(0, 8), position: i.position }))
    });
    
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
    console.log('[TimelinePositions] ➖ Removing items:', {
      count: ids.length,
      ids: ids.map(id => id.substring(0, 8))
    });
    
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
    console.log('[TimelinePositions] 🔒 Locking positions');
    setIsLocked(true);
  }, []);
  
  const unlockPositions = useCallback(() => {
    console.log('[TimelinePositions] 🔓 Unlocking positions');
    setIsLocked(false);
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

