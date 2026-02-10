/**
 * Timeline Frame Calculators
 *
 * Pure functions for timeline frame position calculations:
 * - Gap finding and frame distribution
 * - Normalization (compress gaps, shift to start at 0)
 * - Position calculation for drag-and-drop operations
 *
 * No React hooks or side effects - all functions are stateless.
 */

import type { ShotGeneration } from '@/shared/hooks/useTimelineCore';
import { calculateAverageSpacing, DEFAULT_FRAME_SPACING } from '@/shared/utils/timelinePositionCalculator';
import { MAX_FRAME_GAP } from '@/shared/lib/timelineNormalization';

// ============================================================================
// Types
// ============================================================================

export interface FrameUpdate {
  id: string;
  newFrame: number;
  reason: string;
}

// ============================================================================
// Normalization
// ============================================================================

/**
 * Normalize a set of final positions: start at 0, compress gaps > MAX_FRAME_GAP.
 * Returns a map of id -> { newFrame, reason } for items that need updating.
 * @internal Used only within this module by buildAndNormalizeFinalPositions.
 */
function normalizePositions(
  allFinalPositions: Array<{ id: string; frame: number }>
): Map<string, { newFrame: number; reason: string }> {
  const normalizedUpdates = new Map<string, { newFrame: number; reason: string }>();

  if (allFinalPositions.length === 0) return normalizedUpdates;

  // Sort by frame position
  const sorted = [...allFinalPositions].sort((a, b) => a.frame - b.frame);

  let currentFrame = 0;

  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i];

    if (i === 0) {
      if (item.frame !== 0) {
        normalizedUpdates.set(item.id, { newFrame: 0, reason: 'Normalized to start at 0' });
      }
      currentFrame = 0;
    } else {
      const prevItem = sorted[i - 1];
      const originalGap = item.frame - prevItem.frame;
      const normalizedGap = Math.min(originalGap, MAX_FRAME_GAP);
      const normalizedFrame = currentFrame + normalizedGap;

      if (normalizedFrame !== item.frame) {
        normalizedUpdates.set(item.id, {
          newFrame: normalizedFrame,
          reason: originalGap > MAX_FRAME_GAP
            ? `Gap compressed from ${originalGap} to ${normalizedGap}`
            : 'Shifted to maintain sequence'
        });
      }
      currentFrame = normalizedFrame;
    }
  }

  return normalizedUpdates;
}

// ============================================================================
// Frame distribution for drag-and-drop
// ============================================================================

/**
 * Find a ShotGeneration by id or generation_id
 */
export function findGeneration(
  shotGenerations: ShotGeneration[],
  key?: string | null
): ShotGeneration | undefined {
  if (!key) return undefined;
  return shotGenerations.find(sg => sg.id === key || sg.generation_id === key);
}

interface DistributionContext {
  draggedShotGens: ShotGeneration[];
  draggedItemIds: string[];
  newStartIndex: number;
  allItems: Array<{ id: string; timeline_frame: number | null }>;
  shotGenerations: ShotGeneration[];
}

/**
 * Calculate frame positions for dragged items based on their new position in the list.
 * Returns accumulated updates (not yet deduplicated or normalized).
 */
export function calculateDistributedFrames(ctx: DistributionContext): FrameUpdate[] {
  const { draggedShotGens, draggedItemIds, newStartIndex, allItems, shotGenerations } = ctx;
  const accumulateUpdates: FrameUpdate[] = [];

  const pushUpdate = (id: string, frame: number, reason: string) => {
    const normalizedFrame = Math.max(0, Math.floor(frame));
    accumulateUpdates.push({ id, newFrame: normalizedFrame, reason });
  };

  const newEndIndex = newStartIndex + draggedItemIds.length - 1;
  const predecessor = newStartIndex > 0 ? allItems[newStartIndex - 1] : null;
  const successor = newEndIndex < allItems.length - 1 ? allItems[newEndIndex + 1] : null;

  if (newStartIndex === 0 && successor) {
    // Special case: dropping at position 0
    calculateDropAtPositionZero(
      draggedShotGens, draggedItemIds, newEndIndex, allItems, shotGenerations, successor, pushUpdate
    );
  } else if (predecessor && successor && predecessor.timeline_frame != null && successor.timeline_frame != null) {
    // Between two items - distribute evenly in the gap
    const gap = successor.timeline_frame - predecessor.timeline_frame;
    const numItems = draggedItemIds.length;
    const interval = gap / (numItems + 1);

    draggedShotGens.forEach((sg, i) => {
      const newFrame = predecessor.timeline_frame! + (interval * (i + 1));
      pushUpdate(sg.id, newFrame, `Distributed in gap (${i + 1}/${numItems})`);
    });
  } else if (predecessor && predecessor.timeline_frame != null) {
    // At end - extend timeline using average spacing of existing items
    const existingFrames = allItems
      .filter(item => item.timeline_frame != null)
      .map(item => item.timeline_frame!);
    const spacing = calculateAverageSpacing(existingFrames, DEFAULT_FRAME_SPACING);

    draggedShotGens.forEach((sg, i) => {
      const newFrame = predecessor.timeline_frame! + (spacing * (i + 1));
      pushUpdate(sg.id, newFrame, `Extend at end (${i + 1}/${draggedItemIds.length})`);
    });
  } else if (successor && successor.timeline_frame != null) {
    // At start - distribute between 0 and successor
    const gap = successor.timeline_frame;
    const numItems = draggedItemIds.length;
    const interval = gap / (numItems + 1);

    draggedShotGens.forEach((sg, i) => {
      const newFrame = interval * (i + 1);
      pushUpdate(sg.id, newFrame, `Distributed from start (${i + 1}/${numItems})`);
    });
  } else {
    // First items in timeline - start at 0 and space by default

    draggedShotGens.forEach((sg, i) => {
      const newFrame = DEFAULT_FRAME_SPACING * i;
      pushUpdate(sg.id, newFrame, `Initial placement (${i + 1}/${draggedItemIds.length})`);
    });
  }

  return accumulateUpdates;
}

/**
 * Handle the special case of dropping items at position 0.
 */
function calculateDropAtPositionZero(
  draggedShotGens: ShotGeneration[],
  draggedItemIds: string[],
  newEndIndex: number,
  allItems: Array<{ id: string; timeline_frame: number | null }>,
  shotGenerations: ShotGeneration[],
  successor: { id: string; timeline_frame: number | null },
  pushUpdate: (id: string, frame: number, reason: string) => void
) {
  const displacedFirstItem = successor;
  const oldSecondItem = newEndIndex + 2 < allItems.length ? allItems[newEndIndex + 2] : null;

  // First dragged item goes to frame 0
  pushUpdate(draggedShotGens[0].id, 0, 'First item at position 0');

  // Calculate new position for displaced first item
  let displacedNewFrame: number;
  if (oldSecondItem?.timeline_frame != null) {
    displacedNewFrame = Math.floor((0 + oldSecondItem.timeline_frame) / 2);
  } else if (displacedFirstItem.timeline_frame != null) {
    displacedNewFrame = Math.max(DEFAULT_FRAME_SPACING, displacedFirstItem.timeline_frame);
  } else {
    displacedNewFrame = DEFAULT_FRAME_SPACING;
  }

  // Update displaced item
  const displacedShotGen = findGeneration(shotGenerations, displacedFirstItem.id);
  if (displacedShotGen?.id) {
    pushUpdate(displacedShotGen.id, displacedNewFrame, 'Displaced first item shifted');
  }

  // Distribute remaining dragged items between 0 and displaced item's new position
  if (draggedItemIds.length > 1) {
    const numRemaining = draggedItemIds.length - 1;
    const gap = displacedNewFrame;
    const interval = gap / (numRemaining + 1);

    for (let i = 1; i < draggedItemIds.length; i++) {
      const newFrame = interval * i;
      pushUpdate(draggedShotGens[i].id, newFrame, `Distributed after first (${i}/${draggedItemIds.length})`);
    }
  }
}

// ============================================================================
// Update deduplication
// ============================================================================

/**
 * Deduplicate frame updates (last write wins per id).
 */
export function deduplicateUpdates(
  updates: FrameUpdate[]
): Map<string, { newFrame: number; reason: string }> {
  const uniqueUpdates = new Map<string, { newFrame: number; reason: string }>();
  updates.forEach(entry => {
    const existing = uniqueUpdates.get(entry.id);
    if (!existing || existing.newFrame !== entry.newFrame) {
      uniqueUpdates.set(entry.id, { newFrame: entry.newFrame, reason: entry.reason });
    }
  });
  return uniqueUpdates;
}

/**
 * Build the complete picture of final positions (updated + unchanged) for all positioned items,
 * then normalize and merge back into the updates map.
 */
export function buildAndNormalizeFinalPositions(
  uniqueUpdates: Map<string, { newFrame: number; reason: string }>,
  shotGenerations: ShotGeneration[]
): Map<string, { newFrame: number; reason: string }> {
  const allFinalPositions: Array<{ id: string; frame: number }> = [];

  for (const sg of shotGenerations) {
    if (sg.timeline_frame == null || sg.timeline_frame < 0) continue;
    const update = uniqueUpdates.get(sg.id);
    const finalFrame = update ? update.newFrame : sg.timeline_frame;
    allFinalPositions.push({ id: sg.id, frame: finalFrame });
  }

  allFinalPositions.sort((a, b) => a.frame - b.frame);

  if (allFinalPositions.length === 0) return uniqueUpdates;

  const normalizedUpdates = normalizePositions(allFinalPositions);

  // Merge normalized updates into uniqueUpdates
  for (const [id, payload] of normalizedUpdates) {
    const existing = uniqueUpdates.get(id);
    if (existing) {
      uniqueUpdates.set(id, { newFrame: payload.newFrame, reason: `${existing.reason} → ${payload.reason}` });
    } else {
      uniqueUpdates.set(id, payload);
    }
  }

  return uniqueUpdates;
}
