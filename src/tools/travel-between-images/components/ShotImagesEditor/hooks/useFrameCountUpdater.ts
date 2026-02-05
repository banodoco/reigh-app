/**
 * Hook for updating pair frame counts on the timeline.
 * Handles the complex logic of shifting subsequent images and compression.
 */

import { useCallback, type RefObject } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { GenerationRow } from '@/types/shots';

export interface UseFrameCountUpdaterProps {
  /** Shot generations (images) */
  shotGenerations: GenerationRow[];
  /** Current generation mode */
  generationMode: 'batch' | 'timeline';
  /** Maximum frame limit for a single pair */
  maxFrameLimit: number;
  /** Reload positions after update */
  loadPositions: (options?: { silent?: boolean; reason?: string }) => Promise<void>;
  /**
   * Ref to a function that updates trailing end frame through the position system.
   * When set, trailing segment changes get instant optimistic updates on the timeline.
   * When null/undefined, falls back to direct DB write + loadPositions (slower round-trip).
   */
  trailingFrameUpdateRef?: RefObject<((endFrame: number) => void) | null>;
}

export interface UseFrameCountUpdaterReturn {
  /** Update the frame count for a pair, shifting subsequent images as needed */
  updatePairFrameCount: (pairShotGenerationId: string, newFrameCount: number) => Promise<{ finalFrameCount: number } | void>;
}

/**
 * Provides a function to update the frame count for a pair.
 *
 * For pairs with an end image: shifts subsequent images forward.
 * For trailing segments (no end image): updates metadata.end_frame on the start image.
 *
 * When exceeding maxFrameLimit, compresses subsequent pairs proportionally.
 */
export function useFrameCountUpdater({
  shotGenerations,
  generationMode,
  maxFrameLimit,
  loadPositions,
  trailingFrameUpdateRef,
}: UseFrameCountUpdaterProps): UseFrameCountUpdaterReturn {
  const updatePairFrameCount = useCallback(async (
    pairShotGenerationId: string,
    newFrameCount: number
  ) => {
    // Only works in timeline mode
    if (!shotGenerations?.length || generationMode !== 'timeline') {
      return;
    }

    // Sort images by frame position
    const sortedImages = [...shotGenerations]
      .filter((img) => img.timeline_frame != null && img.timeline_frame >= 0)
      .sort((a, b) => (a.timeline_frame ?? 0) - (b.timeline_frame ?? 0));

    // Find the image by id
    const pairIndex = sortedImages.findIndex((img) => img.id === pairShotGenerationId);
    if (pairIndex === -1) {
      return;
    }

    const startImage = sortedImages[pairIndex];
    const startFrame = startImage.timeline_frame ?? 0;
    const isTrailingSegment = pairIndex === sortedImages.length - 1;

    // Calculate effective frame count (capped at maxFrameLimit)
    const effectiveNewFrameCount = Math.min(newFrameCount, maxFrameLimit);

    // Handle trailing segment (no end image) - update via position system or fallback to direct DB write
    if (isTrailingSegment) {
      const newEndFrame = startFrame + effectiveNewFrameCount;

      // Preferred path: update through the position system for instant optimistic updates.
      // The position system (updatePositions) handles both the visual update and the DB persist.
      if (trailingFrameUpdateRef?.current) {
        trailingFrameUpdateRef.current(newEndFrame);
        return { finalFrameCount: effectiveNewFrameCount };
      }

      // Fallback: direct DB write + reload (used when position system not connected, e.g. batch mode)
      const { data: current, error: fetchError } = await supabase
        .from('shot_generations')
        .select('metadata')
        .eq('id', pairShotGenerationId)
        .single();

      if (fetchError) {
        console.error('[useFrameCountUpdater] Error fetching metadata:', fetchError);
        return;
      }

      const currentMetadata = (current?.metadata as Record<string, unknown>) || {};

      const { error: updateError } = await supabase
        .from('shot_generations')
        .update({
          metadata: {
            ...currentMetadata,
            end_frame: newEndFrame,
          },
        })
        .eq('id', pairShotGenerationId);

      if (updateError) {
        console.error('[useFrameCountUpdater] Error updating end_frame:', updateError);
        return;
      }

      if (loadPositions) {
        await loadPositions({ silent: true, reason: 'end-frame-update' });
      }

      return { finalFrameCount: effectiveNewFrameCount };
    }

    // Standard case: pair with end image - shift subsequent images
    const endImage = sortedImages[pairIndex + 1];
    const currentFrameCount = (endImage.timeline_frame ?? 0) - startFrame;
    const exceedsMax = newFrameCount > maxFrameLimit;

    // Collect subsequent pairs for potential compression
    const subsequentPairs: Array<{ startIdx: number; endIdx: number; originalFrames: number }> = [];
    for (let j = pairIndex + 1; j < sortedImages.length - 1; j++) {
      const pairStart = sortedImages[j];
      const pairEnd = sortedImages[j + 1];
      subsequentPairs.push({
        startIdx: j,
        endIdx: j + 1,
        originalFrames: (pairEnd.timeline_frame ?? 0) - (pairStart.timeline_frame ?? 0),
      });
    }

    // Calculate how much we can borrow from subsequent pairs
    const overflow = exceedsMax ? newFrameCount - maxFrameLimit : 0;
    const needsCompression = overflow > 0 && subsequentPairs.length > 0;
    const totalSubsequentFrames = subsequentPairs.reduce((sum, p) => sum + p.originalFrames, 0);
    const minTotalSubsequent = subsequentPairs.length; // 1 frame minimum per pair
    const maxBorrowable = Math.max(0, totalSubsequentFrames - minTotalSubsequent);
    const actualBorrow = Math.min(overflow, maxBorrowable);
    const finalFrameCount = effectiveNewFrameCount + actualBorrow;
    const finalDelta = finalFrameCount - currentFrameCount;

    if (finalDelta === 0) {
      return;
    }

    // Calculate new positions
    const updates: Array<{ id: string; newFrame: number }> = [];

    if (needsCompression && actualBorrow > 0) {
      // Compress subsequent pairs proportionally
      const targetTotal = totalSubsequentFrames - actualBorrow;
      const compressionRatio = targetTotal / totalSubsequentFrames;

      let currentFrame = startFrame + finalFrameCount;
      updates.push({ id: sortedImages[pairIndex + 1].id, newFrame: currentFrame });

      for (let i = 0; i < subsequentPairs.length; i++) {
        const pair = subsequentPairs[i];
        const compressedFrames = Math.max(1, Math.min(maxFrameLimit, Math.round(pair.originalFrames * compressionRatio)));
        currentFrame += compressedFrames;

        if (pair.endIdx < sortedImages.length) {
          updates.push({ id: sortedImages[pair.endIdx].id, newFrame: currentFrame });
        }
      }
    } else {
      // Simple shift: add delta to all subsequent images
      for (let j = pairIndex + 1; j < sortedImages.length; j++) {
        const img = sortedImages[j];
        const newFrame = (img.timeline_frame ?? 0) + finalDelta;
        updates.push({ id: img.id, newFrame });
      }
    }

    // Apply updates to database
    await Promise.all(updates.map(update =>
      supabase
        .from('shot_generations')
        .update({ timeline_frame: update.newFrame })
        .eq('id', update.id)
    ));

    // Refresh data
    if (loadPositions) {
      await loadPositions({ silent: true, reason: 'frame-count-update' });
    }

    return { finalFrameCount };
  }, [shotGenerations, generationMode, loadPositions, maxFrameLimit, trailingFrameUpdateRef]);

  return { updatePairFrameCount };
}
