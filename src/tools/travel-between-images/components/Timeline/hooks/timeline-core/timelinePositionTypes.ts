import type { GenerationRow } from '@/domains/generation/types';

export type PositionStatus =
  | { type: 'idle' }
  | { type: 'updating'; operationId: string; description: string }
  | { type: 'error'; message: string; canRetry: boolean };

export interface UseTimelinePositionsProps {
  shotId: string | null;
  shotGenerations: GenerationRow[];
  frameSpacing?: number;
  onPositionsChange?: (positions: Map<string, number>) => void;
}

export interface UpdateOptions {
  operation?: 'drag' | 'drop' | 'reorder' | 'reset';
  optimisticAppliedExternally?: boolean;
  skipDatabase?: boolean;
  metadata?: Record<string, unknown>;
  /**
   * When optimistic update was applied externally (before the write queue),
   * pass its rollback function here so updatePositions can roll back on error.
   */
  externalRollback?: (() => void) | null;
  signal?: AbortSignal;
}

export interface UseTimelinePositionsReturn {
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
}
