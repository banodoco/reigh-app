/**
 * useTimelineCore - Core hook for timeline position management
 *
 * This is the single source of truth for timeline positions and operations.
 * It consolidates functionality from:
 * - useEnhancedShotPositions (position operations)
 * - useTimelinePositionUtils (batch operations, normalization)
 * - useBatchReorder (reordering)
 *
 * Architecture:
 * - Data: Uses useShotImages for the canonical data source
 * - Derived: Provides filtered/sorted positioned items via useMemo
 * - Operations: Uses atomic RPCs (delete_and_normalize, unposition_and_normalize, reorder_normalized)
 * - Pair Data: Reads/writes pair prompt overrides via metadata.segmentOverrides
 */

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/shared/lib/queryKeys';
import type { GenerationRow } from '@/types/shots';
import type { Json } from '@/integrations/supabase/types';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { useShotImages } from '@/shared/hooks/useShotImages';
import { useInvalidateGenerations } from '@/shared/hooks/useGenerationInvalidation';
import { isVideoGeneration } from '@/shared/lib/typeGuards';
import { readSegmentOverrides, writeSegmentOverrides } from '@/shared/utils/settingsMigration';
import { calculateNextAvailableFrame, extractExistingFrames, DEFAULT_FRAME_SPACING } from '@/shared/utils/timelinePositionCalculator';
import type { SegmentOverrides } from '@/shared/types/segmentSettings';
import {
  runSerializedTimelineWrite,
  runTimelineWriteWithTimeout,
} from '@/shared/lib/timelineWriteQueue';
import { persistTimelineFrameBatch } from '@/shared/lib/timelineFrameBatchPersist';

const TIMELINE_CORE_LOG_PREFIX = '[TimelineCorePersist]';
const log = (...args: Parameters<typeof console.log>) => console.log(...args);

function shortId(id: string | null | undefined): string | null {
  return id ? id.slice(0, 8) : null;
}

// ============================================================================
// Types
// ============================================================================

interface PairPrompts {
  prompt: string;
  negativePrompt: string;
}

// Legacy types - exported for backward compatibility during migration
export interface ShotGeneration {
  id: string;
  shot_id: string;
  generation_id: string;
  timeline_frame: number;
  metadata?: PositionMetadata;
  generation?: {
    id: string;
    location?: string;
    type?: string;
    created_at: string;
    starred?: boolean;
  };
}

export interface PositionMetadata {
  frame_spacing?: number;
  is_keyframe?: boolean;
  locked?: boolean;
  context_frames?: number;
  user_positioned?: boolean;
  created_by_mode?: 'timeline' | 'batch';
  auto_initialized?: boolean;
  drag_source?: string;
  drag_session_id?: string;
  segmentOverrides?: SegmentOverrides;
  enhanced_prompt?: string;
}

interface TimelineCoreResult {
  // Data
  generations: GenerationRow[] | undefined;
  positionedItems: GenerationRow[];
  unpositionedItems: GenerationRow[];
  isLoading: boolean;
  error: Error | null;

  // Position operations (all normalize automatically)
  updatePosition: (shotGenerationId: string, newFrame: number) => Promise<void>;
  commitPositions: (updates: Array<{ shotGenerationId: string; newFrame: number }>) => Promise<void>;
  reorder: (newOrder: string[]) => Promise<void>;

  // Item operations
  deleteItem: (shotGenerationId: string) => Promise<void>;
  unpositionItem: (shotGenerationId: string) => Promise<void>;
  addItem: (generationId: string, options?: { timelineFrame?: number }) => Promise<string | null>;

  // Pair data
  pairPrompts: Record<number, PairPrompts>;
  updatePairPrompts: (shotGenerationId: string, prompt: string, negativePrompt: string) => Promise<void>;
  updatePairPromptsByIndex: (pairIndex: number, prompt: string, negativePrompt: string) => Promise<void>;

  // Segment overrides
  getSegmentOverrides: (pairIndex: number) => SegmentOverrides;
  updateSegmentOverrides: (pairIndex: number, overrides: Partial<SegmentOverrides>) => Promise<void>;

  // Enhanced prompts
  getEnhancedPrompt: (shotGenerationId: string) => string | undefined;
  clearEnhancedPrompt: (shotGenerationId: string) => Promise<void>;
  clearAllEnhancedPrompts: () => Promise<void>;

  // Manual operations (rarely needed)
  normalize: () => Promise<void>;
  refetch: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

type InvalidateGenerationsFn = ReturnType<typeof useInvalidateGenerations>;

interface TimelinePositionOperations {
  updatePosition: TimelineCoreResult['updatePosition'];
  commitPositions: TimelineCoreResult['commitPositions'];
  reorder: TimelineCoreResult['reorder'];
  normalize: TimelineCoreResult['normalize'];
}

interface TimelineItemOperations {
  deleteItem: TimelineCoreResult['deleteItem'];
  unpositionItem: TimelineCoreResult['unpositionItem'];
  addItem: TimelineCoreResult['addItem'];
}

interface TimelinePairOperations {
  pairPrompts: TimelineCoreResult['pairPrompts'];
  updatePairPrompts: TimelineCoreResult['updatePairPrompts'];
  updatePairPromptsByIndex: TimelineCoreResult['updatePairPromptsByIndex'];
  getSegmentOverrides: TimelineCoreResult['getSegmentOverrides'];
  updateSegmentOverrides: TimelineCoreResult['updateSegmentOverrides'];
}

interface TimelineEnhancedPromptOperations {
  getEnhancedPrompt: TimelineCoreResult['getEnhancedPrompt'];
  clearEnhancedPrompt: TimelineCoreResult['clearEnhancedPrompt'];
  clearAllEnhancedPrompts: TimelineCoreResult['clearAllEnhancedPrompts'];
}

function hasValidLocation(generation: GenerationRow): boolean {
  const location = generation.imageUrl || generation.location;
  return !!location && location !== '/placeholder.svg';
}

function useTimelineDerivedItems(generations: GenerationRow[] | undefined) {
  const positionedItems = useMemo(() => {
    if (!generations) return [];

    return generations
      .filter(
        (generation) =>
          generation.timeline_frame != null
          && generation.timeline_frame >= 0
          && !isVideoGeneration(generation)
          && hasValidLocation(generation)
      )
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
  }, [generations]);

  const unpositionedItems = useMemo(() => {
    if (!generations) return [];

    return generations.filter(
      (generation) =>
        generation.timeline_frame == null
        && !isVideoGeneration(generation)
        && hasValidLocation(generation)
    );
  }, [generations]);

  return { positionedItems, unpositionedItems };
}

function useTimelinePositionOperations(
  shotId: string | null,
  positionedItems: GenerationRow[],
  invalidateGenerations: InvalidateGenerationsFn
): TimelinePositionOperations {
  const logQueuePhase = useCallback((
    phase: 'queued' | 'start' | 'end',
    meta: {
      shotId: string;
      operation: string;
      waitMs: number;
      durationMs: number;
      queueDepth: number;
    },
  ) => {
    if (phase === 'queued') {
      log(`${TIMELINE_CORE_LOG_PREFIX} write queue queued`, {
        shotId: shortId(meta.shotId),
        operation: meta.operation,
        waitMs: meta.waitMs,
        durationMs: meta.durationMs,
        queueDepth: meta.queueDepth,
      });
      return;
    }

    if (phase === 'start') {
      log(`${TIMELINE_CORE_LOG_PREFIX} write queue start`, {
        shotId: shortId(meta.shotId),
        operation: meta.operation,
        waitMs: meta.waitMs,
        queueDepth: meta.queueDepth,
      });
      return;
    }

    log(`${TIMELINE_CORE_LOG_PREFIX} write queue end`, {
      shotId: shortId(meta.shotId),
      operation: meta.operation,
      waitMs: meta.waitMs,
      durationMs: meta.durationMs,
      queueDepth: meta.queueDepth,
    });
  }, []);

  const updatePosition = useCallback<TimelineCoreResult['updatePosition']>(
    async (shotGenerationId, newFrame) => {
      if (!shotId) return;

      await runSerializedTimelineWrite(
        shotId,
        'timeline-core-update-position',
        async () => {
          try {
            await runTimelineWriteWithTimeout(
              'timeline-core-update-position-write',
              async (signal) => {
                const { error } = await supabase
                  .from('shot_generations')
                  .update({
                    timeline_frame: newFrame,
                    metadata: { user_positioned: true },
                  })
                  .eq('id', shotGenerationId)
                  .abortSignal(signal);

                if (error) {
                  throw error;
                }
              },
              {
                onTimeout: ({ timeoutMs, pendingMs }) => {
                  log(`${TIMELINE_CORE_LOG_PREFIX} single update timed out`, {
                    shotId: shortId(shotId),
                    shotGenerationId: shortId(shotGenerationId),
                    newFrame,
                    timeoutMs,
                    pendingMs,
                  });
                },
              },
            );
            invalidateGenerations(shotId, { reason: 'position-update', scope: 'images' });
          } catch (err) {
            throw handleError(err, { context: 'useTimelineCore.updatePosition', toastTitle: 'Failed to update position' });
          }
        },
        logQueuePhase,
      );
    },
    [shotId, invalidateGenerations, logQueuePhase]
  );

  const commitPositions = useCallback<TimelineCoreResult['commitPositions']>(
    async (updates) => {
      if (!shotId || updates.length === 0) return;

      await runSerializedTimelineWrite(
        shotId,
        'timeline-core-commit-positions',
        async () => {
          try {
            await persistTimelineFrameBatch({
              shotId,
              updates: updates.map((update) => ({
                shotGenerationId: update.shotGenerationId,
                timelineFrame: update.newFrame,
                metadata: { user_positioned: true },
              })),
              operationLabel: 'timeline-core-commit-positions',
              timeoutOperationName: 'timeline-core-commit-positions-rpc',
              logPrefix: TIMELINE_CORE_LOG_PREFIX,
              log,
            });

            invalidateGenerations(shotId, { reason: 'positions-commit', scope: 'all' });
          } catch (err) {
            throw handleError(err, { context: 'useTimelineCore.commitPositions', toastTitle: 'Failed to update positions' });
          }
        },
        logQueuePhase,
      );
    },
    [shotId, invalidateGenerations, logQueuePhase]
  );

  const reorder = useCallback<TimelineCoreResult['reorder']>(
    async (newOrder) => {
      if (!shotId || newOrder.length === 0) return;

      try {
        const { error } = await supabase.rpc('reorder_normalized', {
          p_shot_id: shotId,
          p_new_order: newOrder,
        });

        if (error) throw error;
        invalidateGenerations(shotId, { reason: 'reorder', scope: 'all' });
      } catch (err) {
        throw handleError(err, { context: 'useTimelineCore.reorder', toastTitle: 'Failed to reorder items' });
      }
    },
    [shotId, invalidateGenerations]
  );

  const normalize = useCallback<TimelineCoreResult['normalize']>(async () => {
    if (!shotId || positionedItems.length === 0) return;

    try {
      const currentOrder = positionedItems
        .map((generation) => generation.shotImageEntryId)
        .filter(Boolean) as string[];
      const { error } = await supabase.rpc('reorder_normalized', {
        p_shot_id: shotId,
        p_new_order: currentOrder,
      });

      if (error) throw error;
      invalidateGenerations(shotId, { reason: 'normalize', scope: 'all' });
    } catch (err) {
      throw handleError(err, {
        context: 'useTimelineCore.normalize',
        toastTitle: 'Failed to normalize timeline',
      });
    }
  }, [shotId, positionedItems, invalidateGenerations]);

  return { updatePosition, commitPositions, reorder, normalize };
}

function useTimelineItemOperations(
  shotId: string | null,
  positionedItems: GenerationRow[],
  invalidateGenerations: InvalidateGenerationsFn
): TimelineItemOperations {
  const deleteItem = useCallback<TimelineCoreResult['deleteItem']>(
    async (shotGenerationId) => {
      if (!shotId) return;

      try {
        const { error } = await supabase.rpc('delete_and_normalize', {
          p_shot_id: shotId,
          p_shot_generation_id: shotGenerationId,
        });

        if (error) throw error;
        invalidateGenerations(shotId, { reason: 'delete-item', scope: 'all', includeShots: true });
      } catch (err) {
        throw handleError(err, { context: 'useTimelineCore.deleteItem', toastTitle: 'Failed to delete item' });
      }
    },
    [shotId, invalidateGenerations]
  );

  const unpositionItem = useCallback<TimelineCoreResult['unpositionItem']>(
    async (shotGenerationId) => {
      if (!shotId) return;

      try {
        const { error } = await supabase.rpc('unposition_and_normalize', {
          p_shot_id: shotId,
          p_shot_generation_id: shotGenerationId,
        });

        if (error) throw error;
        invalidateGenerations(shotId, { reason: 'unposition-item', scope: 'all' });
      } catch (err) {
        throw handleError(err, { context: 'useTimelineCore.unpositionItem', toastTitle: 'Failed to remove from timeline' });
      }
    },
    [shotId, invalidateGenerations]
  );

  const addItem = useCallback<TimelineCoreResult['addItem']>(
    async (generationId, options) => {
      if (!shotId) return null;

      const nextFrame = options?.timelineFrame !== undefined
        ? options.timelineFrame
        : calculateNextAvailableFrame(extractExistingFrames(positionedItems));

      try {
        const { data, error } = await supabase
          .from('shot_generations')
          .insert({
            shot_id: shotId,
            generation_id: generationId,
            timeline_frame: nextFrame,
            metadata: {
              user_positioned: true,
              created_by_mode: 'batch',
              frame_spacing: DEFAULT_FRAME_SPACING,
            },
          })
          .select('id')
          .single();

        if (error) throw error;
        invalidateGenerations(shotId, { reason: 'add-item', scope: 'all' });
        return data?.id || null;
      } catch (err) {
        throw handleError(err, { context: 'useTimelineCore.addItem', toastTitle: 'Failed to add item to timeline' });
      }
    },
    [shotId, positionedItems, invalidateGenerations]
  );

  return { deleteItem, unpositionItem, addItem };
}

function useTimelinePairOperations(
  shotId: string | null,
  positionedItems: GenerationRow[],
  invalidateGenerations: InvalidateGenerationsFn,
  queryClient: ReturnType<typeof useQueryClient>
): TimelinePairOperations {
  const pairPrompts = useMemo<TimelineCoreResult['pairPrompts']>(() => {
    if (positionedItems.length === 0) return {};

    const promptsByPair: Record<number, PairPrompts> = {};
    for (let index = 0; index < positionedItems.length - 1; index += 1) {
      const firstItem = positionedItems[index];
      const overrides = readSegmentOverrides(firstItem.metadata as Record<string, unknown> | null);

      if (overrides.prompt || overrides.negativePrompt) {
        promptsByPair[index] = {
          prompt: overrides.prompt || '',
          negativePrompt: overrides.negativePrompt || '',
        };
      }
    }

    return promptsByPair;
  }, [positionedItems]);

  const updatePairPrompts = useCallback<TimelineCoreResult['updatePairPrompts']>(
    async (shotGenerationId, prompt, negativePrompt) => {
      if (!shotId) return;

      try {
        const item = positionedItems.find((generation) => generation.shotImageEntryId === shotGenerationId);
        if (!item) {
          throw new Error(`Item ${shotGenerationId} not found`);
        }

        const currentOverrides = readSegmentOverrides(item.metadata as Record<string, unknown> | null);
        const updatedMetadata = writeSegmentOverrides(item.metadata as Record<string, unknown> | null, {
          ...currentOverrides,
          prompt,
          negativePrompt,
        });
        const { error } = await supabase
          .from('shot_generations')
          .update({ metadata: updatedMetadata as unknown as Json })
          .eq('id', shotGenerationId);

        if (error) throw error;
        invalidateGenerations(shotId, { reason: 'update-pair-prompts', scope: 'metadata' });
        queryClient.invalidateQueries({ queryKey: queryKeys.segments.pairMetadata(shotGenerationId) });
      } catch (err) {
        throw handleError(err, {
          context: 'useTimelineCore.updatePairPrompts',
          toastTitle: 'Failed to update pair prompts',
          showToast: false,
        });
      }
    },
    [shotId, positionedItems, invalidateGenerations, queryClient]
  );

  const updatePairPromptsByIndex = useCallback<TimelineCoreResult['updatePairPromptsByIndex']>(
    async (pairIndex, prompt, negativePrompt) => {
      if (pairIndex >= positionedItems.length - 1) return;

      const firstItem = positionedItems[pairIndex];
      if (!firstItem.shotImageEntryId) return;
      await updatePairPrompts(firstItem.shotImageEntryId, prompt, negativePrompt);
    },
    [positionedItems, updatePairPrompts]
  );

  const getSegmentOverrides = useCallback<TimelineCoreResult['getSegmentOverrides']>(
    (pairIndex) => {
      if (pairIndex >= positionedItems.length - 1) return {};

      const firstItem = positionedItems[pairIndex];
      return readSegmentOverrides(firstItem.metadata as Record<string, unknown> | null);
    },
    [positionedItems]
  );

  const updateSegmentOverrides = useCallback<TimelineCoreResult['updateSegmentOverrides']>(
    async (pairIndex, overrides) => {
      if (!shotId || pairIndex >= positionedItems.length - 1) return;

      const firstItem = positionedItems[pairIndex];
      if (!firstItem.shotImageEntryId) return;

      try {
        const currentOverrides = readSegmentOverrides(firstItem.metadata as Record<string, unknown> | null);
        const updatedMetadata = writeSegmentOverrides(firstItem.metadata as Record<string, unknown> | null, {
          ...currentOverrides,
          ...overrides,
        });
        const { error } = await supabase
          .from('shot_generations')
          .update({ metadata: updatedMetadata as unknown as Json })
          .eq('id', firstItem.shotImageEntryId);

        if (error) throw error;
        invalidateGenerations(shotId, { reason: 'update-segment-overrides', scope: 'metadata' });
      } catch (err) {
        throw handleError(err, {
          context: 'useTimelineCore.updateSegmentOverrides',
          toastTitle: 'Failed to update segment overrides',
          showToast: false,
        });
      }
    },
    [shotId, positionedItems, invalidateGenerations]
  );

  return {
    pairPrompts,
    updatePairPrompts,
    updatePairPromptsByIndex,
    getSegmentOverrides,
    updateSegmentOverrides,
  };
}

function useTimelineEnhancedPromptOperations(
  shotId: string | null,
  positionedItems: GenerationRow[],
  invalidateGenerations: InvalidateGenerationsFn,
  queryClient: ReturnType<typeof useQueryClient>
): TimelineEnhancedPromptOperations {
  const getEnhancedPrompt = useCallback<TimelineCoreResult['getEnhancedPrompt']>(
    (shotGenerationId) => {
      const item = positionedItems.find((generation) => generation.shotImageEntryId === shotGenerationId);
      if (!item?.metadata) return undefined;

      const metadata = item.metadata as Record<string, unknown>;
      return metadata.enhanced_prompt as string | undefined;
    },
    [positionedItems]
  );

  const clearEnhancedPrompt = useCallback<TimelineCoreResult['clearEnhancedPrompt']>(
    async (shotGenerationId) => {
      if (!shotId) return;

      try {
        const item = positionedItems.find((generation) => generation.shotImageEntryId === shotGenerationId);
        if (!item) return;

        const currentMetadata = (item.metadata as Record<string, unknown>) || {};
        const updatedMetadata = {
          ...currentMetadata,
          enhanced_prompt: '',
        };

        queryClient.setQueryData<GenerationRow[]>(
          queryKeys.generations.byShot(shotId),
          (oldData) => oldData?.map((row) =>
            row.id === shotGenerationId
              ? { ...row, metadata: updatedMetadata }
              : row
          )
        );

        const { error } = await supabase
          .from('shot_generations')
          .update({ metadata: updatedMetadata })
          .eq('id', shotGenerationId);

        if (error) {
          invalidateGenerations(shotId, { reason: 'clear-enhanced-prompt-error', scope: 'metadata' });
          throw error;
        }

        invalidateGenerations(shotId, { reason: 'clear-enhanced-prompt', scope: 'metadata' });
      } catch (err) {
        throw handleError(err, {
          context: 'useTimelineCore.clearEnhancedPrompt',
          showToast: false,
        });
      }
    },
    [shotId, positionedItems, invalidateGenerations, queryClient]
  );

  const clearAllEnhancedPrompts = useCallback<TimelineCoreResult['clearAllEnhancedPrompts']>(async () => {
    if (!shotId) return;

    try {
      const itemsWithEnhancedPrompt = positionedItems.filter((generation) => {
        const metadata = generation.metadata as Record<string, unknown>;
        return !!metadata?.enhanced_prompt;
      });

      if (itemsWithEnhancedPrompt.length === 0) return;

      for (const item of itemsWithEnhancedPrompt) {
        if (!item.shotImageEntryId) continue;

        const currentMetadata = (item.metadata as Record<string, unknown>) || {};
        await supabase
          .from('shot_generations')
          .update({
            metadata: {
              ...currentMetadata,
              enhanced_prompt: '',
            },
          })
          .eq('id', item.shotImageEntryId);
      }

      invalidateGenerations(shotId, { reason: 'clear-all-enhanced-prompts', scope: 'metadata' });
    } catch (err) {
      throw handleError(err, {
        context: 'useTimelineCore.clearAllEnhancedPrompts',
        showToast: false,
      });
    }
  }, [shotId, positionedItems, invalidateGenerations]);

  return {
    getEnhancedPrompt,
    clearEnhancedPrompt,
    clearAllEnhancedPrompts,
  };
}

export function useTimelineCore(shotId: string | null): TimelineCoreResult {
  const queryClient = useQueryClient();
  const invalidateGenerations = useInvalidateGenerations();
  const {
    data: generations,
    isLoading,
    error,
    refetch,
  } = useShotImages(shotId);
  const { positionedItems, unpositionedItems } = useTimelineDerivedItems(generations);
  const { updatePosition, commitPositions, reorder, normalize } = useTimelinePositionOperations(
    shotId,
    positionedItems,
    invalidateGenerations
  );
  const { deleteItem, unpositionItem, addItem } = useTimelineItemOperations(
    shotId,
    positionedItems,
    invalidateGenerations
  );
  const {
    pairPrompts,
    updatePairPrompts,
    updatePairPromptsByIndex,
    getSegmentOverrides,
    updateSegmentOverrides,
  } = useTimelinePairOperations(shotId, positionedItems, invalidateGenerations, queryClient);
  const {
    getEnhancedPrompt,
    clearEnhancedPrompt,
    clearAllEnhancedPrompts,
  } = useTimelineEnhancedPromptOperations(shotId, positionedItems, invalidateGenerations, queryClient);

  return {
    generations,
    positionedItems,
    unpositionedItems,
    isLoading,
    error: error || null,
    updatePosition,
    commitPositions,
    reorder,
    deleteItem,
    unpositionItem,
    addItem,
    pairPrompts,
    updatePairPrompts,
    updatePairPromptsByIndex,
    getSegmentOverrides,
    updateSegmentOverrides,
    getEnhancedPrompt,
    clearEnhancedPrompt,
    clearAllEnhancedPrompts,
    normalize,
    refetch: () => refetch(),
  };
}
