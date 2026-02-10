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
 * - Pair Data: Includes pair prompt access with migration from old format
 */

import { useCallback, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryKeys } from '@/shared/lib/queryKeys';
import { GenerationRow } from '@/types/shots';
import { handleError } from '@/shared/lib/errorHandler';
import { useShotImages } from '@/shared/hooks/useShotImages';
import { useInvalidateGenerations } from '@/shared/hooks/useGenerationInvalidation';
import { isVideoGeneration } from '@/shared/lib/typeGuards';
import { readSegmentOverrides, writeSegmentOverrides } from '@/shared/utils/settingsMigration';
import { calculateNextAvailableFrame, extractExistingFrames, DEFAULT_FRAME_SPACING } from '@/shared/utils/timelinePositionCalculator';
import type { PhaseConfig } from '@/shared/types/phaseConfig';

// ============================================================================
// Types
// ============================================================================

interface PairPrompts {
  prompt: string;
  negativePrompt: string;
}

export interface SegmentOverrides {
  prompt?: string;
  negativePrompt?: string;
  motionMode?: 'basic' | 'advanced';
  amountOfMotion?: number;
  phaseConfig?: PhaseConfig;
  selectedPhasePresetId?: string | null;
  loras?: Array<{ path: string; strength: number; id?: string; name?: string }>;
  numFrames?: number;
  randomSeed?: boolean;
  seed?: number;
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
  /** @deprecated Use segmentOverrides.prompt instead */
  pair_prompt?: string;
  /** @deprecated Use segmentOverrides.negativePrompt instead */
  pair_negative_prompt?: string;
  /** @deprecated Use segmentOverrides.phaseConfig instead */
  pair_phase_config?: PhaseConfig;
  /** @deprecated Use segmentOverrides.loras instead */
  pair_loras?: Array<{ path: string; strength: number; id?: string; name?: string }>;
  /** @deprecated Use segmentOverrides.motionMode and segmentOverrides.amountOfMotion instead */
  pair_motion_settings?: { motionMode?: 'basic' | 'advanced'; amountOfMotion?: number };
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

export function useTimelineCore(shotId: string | null): TimelineCoreResult {
  const queryClient = useQueryClient();
  const invalidateGenerations = useInvalidateGenerations();

  // ============================================================================
  // Data Layer - Single source of truth
  // ============================================================================

  const {
    data: generations,
    isLoading,
    error,
    refetch,
  } = useShotImages(shotId);

  // Derived: Positioned items (on timeline, non-video, valid location)
  const positionedItems = useMemo(() => {
    if (!generations) return [];

    return generations
      .filter((g) => {
        const location = g.imageUrl || g.location;
        const hasValidLocation = location && location !== '/placeholder.svg';
        return (
          g.timeline_frame != null &&
          g.timeline_frame >= 0 &&
          !isVideoGeneration(g) &&
          hasValidLocation
        );
      })
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));
  }, [generations]);

  // Derived: Unpositioned items (not on timeline, non-video, valid location)
  const unpositionedItems = useMemo(() => {
    if (!generations) return [];

    return generations.filter((g) => {
      const location = g.imageUrl || g.location;
      const hasValidLocation = location && location !== '/placeholder.svg';
      return g.timeline_frame == null && !isVideoGeneration(g) && hasValidLocation;
    });
  }, [generations]);

  // ============================================================================
  // Position Operations
  // ============================================================================

  // Update single position (for drag preview - no normalization)
  const updatePosition = useCallback(
    async (shotGenerationId: string, newFrame: number) => {
      if (!shotId) return;

      try {
        const { error } = await supabase
          .from('shot_generations')
          .update({
            timeline_frame: newFrame,
            metadata: { user_positioned: true },
          })
          .eq('id', shotGenerationId);

        if (error) throw error;

        // Invalidate to refresh data
        invalidateGenerations(shotId, { reason: 'position-update', scope: 'images' });
      } catch (err) {
        handleError(err, { context: 'useTimelineCore.updatePosition', toastTitle: 'Failed to update position' });
        throw err;
      }
    },
    [shotId, invalidateGenerations]
  );

  // Commit multiple position updates with normalization
  const commitPositions = useCallback(
    async (updates: Array<{ shotGenerationId: string; newFrame: number }>) => {
      if (!shotId || updates.length === 0) return;

      try {
        // Use batch_update_timeline_frames RPC for atomic update
        const rpcUpdates = updates.map((u) => ({
          shot_generation_id: u.shotGenerationId,
          timeline_frame: u.newFrame,
          metadata: { user_positioned: true },
        }));

        const { error } = await supabase.rpc('batch_update_timeline_frames', {
          p_updates: rpcUpdates,
        });

        if (error) throw error;

        // Invalidate to refresh data
        invalidateGenerations(shotId, { reason: 'positions-commit', scope: 'all' });
      } catch (err) {
        handleError(err, { context: 'useTimelineCore.commitPositions', toastTitle: 'Failed to update positions' });
        throw err;
      }
    },
    [shotId, invalidateGenerations]
  );

  // Reorder items with normalized positioning (0, 50, 100, ...)
  const reorder = useCallback(
    async (newOrder: string[]) => {
      if (!shotId || newOrder.length === 0) return;

      try {
        const { error } = await supabase.rpc('reorder_normalized', {
          p_shot_id: shotId,
          p_new_order: newOrder,
        });

        if (error) throw error;

        // Invalidate to refresh data
        invalidateGenerations(shotId, { reason: 'reorder', scope: 'all' });
      } catch (err) {
        handleError(err, { context: 'useTimelineCore.reorder', toastTitle: 'Failed to reorder items' });
        throw err;
      }
    },
    [shotId, invalidateGenerations]
  );

  // ============================================================================
  // Item Operations
  // ============================================================================

  // Delete item and normalize remaining positions
  const deleteItem = useCallback(
    async (shotGenerationId: string) => {
      if (!shotId) return;

      try {
        // Use delete_and_normalize RPC for atomic delete + normalize
        const { error } = await supabase.rpc('delete_and_normalize', {
          p_shot_id: shotId,
          p_shot_generation_id: shotGenerationId,
        });

        if (error) throw error;

        // Invalidate to refresh data
        invalidateGenerations(shotId, { reason: 'delete-item', scope: 'all', includeShots: true });
      } catch (err) {
        handleError(err, { context: 'useTimelineCore.deleteItem', toastTitle: 'Failed to delete item' });
        throw err;
      }
    },
    [shotId, invalidateGenerations]
  );

  // Unposition item (set timeline_frame = NULL) and normalize remaining
  const unpositionItem = useCallback(
    async (shotGenerationId: string) => {
      if (!shotId) return;

      try {
        // Use unposition_and_normalize RPC for atomic unposition + normalize
        const { error } = await supabase.rpc('unposition_and_normalize', {
          p_shot_id: shotId,
          p_shot_generation_id: shotGenerationId,
        });

        if (error) throw error;

        // Invalidate to refresh data
        invalidateGenerations(shotId, { reason: 'unposition-item', scope: 'all' });
      } catch (err) {
        handleError(err, { context: 'useTimelineCore.unpositionItem', toastTitle: 'Failed to remove from timeline' });
        throw err;
      }
    },
    [shotId, invalidateGenerations]
  );

  // Add new item at next available position
  const addItem = useCallback(
    async (generationId: string, options?: { timelineFrame?: number }): Promise<string | null> => {
      if (!shotId) return null;

      // Calculate next available frame if not provided
      let nextFrame: number;
      if (options?.timelineFrame !== undefined) {
        nextFrame = options.timelineFrame;
      } else {
        const existingFrames = extractExistingFrames(positionedItems);
        nextFrame = calculateNextAvailableFrame(existingFrames);
      }

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

        // Invalidate to refresh data
        invalidateGenerations(shotId, { reason: 'add-item', scope: 'all' });

        return data?.id || null;
      } catch (err) {
        handleError(err, { context: 'useTimelineCore.addItem', toastTitle: 'Failed to add item to timeline' });
        throw err;
      }
    },
    [shotId, positionedItems, invalidateGenerations]
  );

  // ============================================================================
  // Pair Data Operations
  // ============================================================================

  // Get pair prompts as a reactive value
  const pairPrompts = useMemo((): Record<number, PairPrompts> => {
    if (positionedItems.length === 0) return {};

    const result: Record<number, PairPrompts> = {};

    // Each pair is represented by its first item (index in the sorted array)
    for (let i = 0; i < positionedItems.length - 1; i++) {
      const firstItem = positionedItems[i];
      // Use migration utility to read from new or old format
      const overrides = readSegmentOverrides(firstItem.metadata as Record<string, unknown> | null);

      if (overrides.prompt || overrides.negativePrompt) {
        result[i] = {
          prompt: overrides.prompt || '',
          negativePrompt: overrides.negativePrompt || '',
        };
      }
    }

    return result;
  }, [positionedItems]);

  // Update pair prompts by shot_generation_id
  const updatePairPrompts = useCallback(
    async (shotGenerationId: string, prompt: string, negativePrompt: string) => {
      if (!shotId) return;

      try {
        // Get current metadata
        const item = positionedItems.find((g) => g.shotImageEntryId === shotGenerationId);
        if (!item) {
          throw new Error(`Item ${shotGenerationId} not found`);
        }

        // Use migration utility to write in new format while preserving other data
        const currentOverrides = readSegmentOverrides(item.metadata as Record<string, unknown> | null);
        const updatedMetadata = writeSegmentOverrides(item.metadata as Record<string, unknown> | null, {
          ...currentOverrides,
          prompt,
          negativePrompt,
        });

        const { error } = await supabase
          .from('shot_generations')
          .update({ metadata: updatedMetadata })
          .eq('id', shotGenerationId);

        if (error) throw error;

        // Invalidate to refresh data
        invalidateGenerations(shotId, { reason: 'update-pair-prompts', scope: 'metadata' });
        queryClient.invalidateQueries({ queryKey: queryKeys.segments.pairMetadata(shotGenerationId) });
      } catch (err) {
        console.error('[useTimelineCore.updatePairPrompts] Error:', err);
        throw err;
      }
    },
    [shotId, positionedItems, invalidateGenerations, queryClient]
  );

  // Update pair prompts by pair index
  const updatePairPromptsByIndex = useCallback(
    async (pairIndex: number, prompt: string, negativePrompt: string) => {
      if (pairIndex >= positionedItems.length - 1) {
        console.error('[useTimelineCore.updatePairPromptsByIndex] Invalid pair index:', pairIndex);
        return;
      }

      const firstItem = positionedItems[pairIndex];
      if (!firstItem.shotImageEntryId) {
        console.error('[useTimelineCore.updatePairPromptsByIndex] No shotImageEntryId for item');
        return;
      }

      await updatePairPrompts(firstItem.shotImageEntryId, prompt, negativePrompt);
    },
    [positionedItems, updatePairPrompts]
  );

  // ============================================================================
  // Segment Overrides Operations
  // ============================================================================

  // Get segment overrides for a pair index
  const getSegmentOverrides = useCallback(
    (pairIndex: number): SegmentOverrides => {
      if (pairIndex >= positionedItems.length - 1) {
        return {};
      }

      const firstItem = positionedItems[pairIndex];
      return readSegmentOverrides(firstItem.metadata as Record<string, unknown> | null);
    },
    [positionedItems]
  );

  // Update segment overrides for a pair index
  const updateSegmentOverrides = useCallback(
    async (pairIndex: number, overrides: Partial<SegmentOverrides>) => {
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
          .update({ metadata: updatedMetadata })
          .eq('id', firstItem.shotImageEntryId);

        if (error) throw error;

        // Invalidate to refresh data
        invalidateGenerations(shotId, { reason: 'update-segment-overrides', scope: 'metadata' });
      } catch (err) {
        console.error('[useTimelineCore.updateSegmentOverrides] Error:', err);
        throw err;
      }
    },
    [shotId, positionedItems, invalidateGenerations]
  );

  // ============================================================================
  // Enhanced Prompt Operations
  // ============================================================================

  // Get enhanced prompt for a shot_generation
  const getEnhancedPrompt = useCallback(
    (shotGenerationId: string): string | undefined => {
      const item = positionedItems.find((g) => g.shotImageEntryId === shotGenerationId);
      if (!item?.metadata) return undefined;

      const metadata = item.metadata as Record<string, unknown>;
      return metadata.enhanced_prompt || metadata.segmentOverrides?.enhanced_prompt;
    },
    [positionedItems]
  );

  // Clear enhanced prompt for a shot_generation
  const clearEnhancedPrompt = useCallback(
    async (shotGenerationId: string) => {
      if (!shotId) return;

      try {
        const item = positionedItems.find((g) => g.shotImageEntryId === shotGenerationId);
        if (!item) return;

        const currentMetadata = (item.metadata as Record<string, unknown>) || {};
        const updatedMetadata = {
          ...currentMetadata,
          enhanced_prompt: '',
        };

        // Optimistic update: immediately update the cache
        queryClient.setQueryData<GenerationRow[]>(
          queryKeys.generations.byShot(shotId),
          (oldData) => {
            if (!oldData) return oldData;
            return oldData.map((row) =>
              row.id === shotGenerationId
                ? { ...row, metadata: updatedMetadata }
                : row
            );
          }
        );

        // Then persist to database
        const { error } = await supabase
          .from('shot_generations')
          .update({ metadata: updatedMetadata })
          .eq('id', shotGenerationId);

        if (error) {
          // Revert optimistic update on error
          invalidateGenerations(shotId, { reason: 'clear-enhanced-prompt-error', scope: 'metadata' });
          throw error;
        }

        // Background refetch to ensure consistency
        invalidateGenerations(shotId, { reason: 'clear-enhanced-prompt', scope: 'metadata' });
      } catch (err) {
        console.error('[useTimelineCore.clearEnhancedPrompt] Error:', err);
        throw err;
      }
    },
    [shotId, positionedItems, invalidateGenerations, queryClient]
  );

  // Clear all enhanced prompts for the shot
  const clearAllEnhancedPrompts = useCallback(async () => {
    if (!shotId) return;

    try {
      // Get all shot_generations with enhanced prompts
      const itemsWithEnhancedPrompts = positionedItems.filter((g) => {
        const metadata = g.metadata as Record<string, unknown>;
        return metadata?.enhanced_prompt;
      });

      if (itemsWithEnhancedPrompts.length === 0) return;

      // Update each one to clear enhanced_prompt
      for (const item of itemsWithEnhancedPrompts) {
        if (!item.shotImageEntryId) continue;

        const currentMetadata = (item.metadata as Record<string, unknown>) || {};
        const updatedMetadata = {
          ...currentMetadata,
          enhanced_prompt: '',
        };

        await supabase
          .from('shot_generations')
          .update({ metadata: updatedMetadata })
          .eq('id', item.shotImageEntryId);
      }

      invalidateGenerations(shotId, { reason: 'clear-all-enhanced-prompts', scope: 'metadata' });
    } catch (err) {
      console.error('[useTimelineCore.clearAllEnhancedPrompts] Error:', err);
      throw err;
    }
  }, [shotId, positionedItems, invalidateGenerations]);

  // ============================================================================
  // Manual Operations
  // ============================================================================

  // Manual normalize (rarely needed - operations normalize automatically)
  const normalize = useCallback(async () => {
    if (!shotId || positionedItems.length === 0) return;

    try {
      // Get current positions and call reorder_normalized to re-normalize
      const currentOrder = positionedItems.map((g) => g.shotImageEntryId).filter(Boolean) as string[];

      const { error } = await supabase.rpc('reorder_normalized', {
        p_shot_id: shotId,
        p_new_order: currentOrder,
      });

      if (error) throw error;

      invalidateGenerations(shotId, { reason: 'normalize', scope: 'all' });
    } catch (err) {
      console.error('[useTimelineCore.normalize] Error:', err);
      throw err;
    }
  }, [shotId, positionedItems, invalidateGenerations]);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    // Data
    generations,
    positionedItems,
    unpositionedItems,
    isLoading,
    error: error || null,

    // Position operations
    updatePosition,
    commitPositions,
    reorder,

    // Item operations
    deleteItem,
    unpositionItem,
    addItem,

    // Pair data
    pairPrompts,
    updatePairPrompts,
    updatePairPromptsByIndex,

    // Segment overrides
    getSegmentOverrides,
    updateSegmentOverrides,

    // Enhanced prompts
    getEnhancedPrompt,
    clearEnhancedPrompt,
    clearAllEnhancedPrompts,

    // Manual operations
    normalize,
    refetch: () => refetch(),
  };
}
