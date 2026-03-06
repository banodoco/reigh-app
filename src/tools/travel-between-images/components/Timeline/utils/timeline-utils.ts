import { quantizeGap } from '@/shared/lib/media/videoUtils';
import { TRAILING_ENDPOINT_KEY } from './timeline-constants';

export { PENDING_POSITION_KEY, TRAILING_ENDPOINT_KEY } from './timeline-constants';
export { getTimelineDimensions, getTrailingEffectiveEnd } from './timeline-dimensions';
export { getPairInfo } from './timeline-pairs';
export { calculateNewVideoPlacement, findTrailingVideoInfo } from './timeline-video-utils';

/** Sort a positions map by frame number (ascending), returning [id, frame] entries. */
export const sortPositionEntries = (positions: Map<string, number>): [string, number][] =>
  [...positions.entries()].sort((a, b) => a[1] - b[1]);

// Minimum gap between frames (4N+1 format, starting at 5)
const MIN_GAP = 5;

/**
 * Quantize all positions to ensure gaps between adjacent items are in 4N+1 format.
 * First item remains at position 0, subsequent items are adjusted to have quantized gaps.
 * The trailing endpoint is extracted before quantizing and re-added after (its gap has
 * different constraints — quantization happens in the drag handler).
 */
export const quantizePositions = (positions: Map<string, number>): Map<string, number> => {
  // Extract trailing endpoint before quantizing
  const trailingValue = positions.get(TRAILING_ENDPOINT_KEY);
  const imagePositions = new Map(positions);
  imagePositions.delete(TRAILING_ENDPOINT_KEY);

  const entries = sortPositionEntries(imagePositions);

  if (entries.length === 0) {
    // If only trailing existed, return it as-is
    const result = new Map<string, number>();
    if (trailingValue !== undefined) result.set(TRAILING_ENDPOINT_KEY, trailingValue);
    return result;
  }

  const result = new Map<string, number>();

  // First item always at 0
  result.set(entries[0][0], 0);

  // Subsequent items: quantize the gap from previous
  for (let i = 1; i < entries.length; i++) {
    const [id, pos] = entries[i];
    const prevPos = result.get(entries[i - 1][0]) ?? 0;
    const originalGap = pos - entries[i - 1][1];
    const quantizedGap = quantizeGap(Math.max(originalGap, MIN_GAP), MIN_GAP);
    result.set(id, prevPos + quantizedGap);
  }

  // Re-add trailing endpoint unchanged
  if (trailingValue !== undefined) {
    result.set(TRAILING_ENDPOINT_KEY, trailingValue);
  }

  return result;
};

// ---------------------------------------------------------------------------
// Shrink oversized gaps and enforce frame 0 constraint.
// First item is always placed at position 0.
// ---------------------------------------------------------------------------
const shrinkOversizedGaps = (
  positions: Map<string, number>,
  excludeId?: string,
  skipQuantization: boolean = false,
): Map<string, number> => {
  const maxGap = Math.max(1, 81);

  // Preserve trailing endpoint separately (not subject to gap shrinking)
  const trailingValue = positions.get(TRAILING_ENDPOINT_KEY);

  const entries = [...positions.entries()].filter(([id]) => id !== excludeId && id !== TRAILING_ENDPOINT_KEY);

  // Ensure frame 0 is included if it exists
  if (!entries.some(([_, pos]) => pos === 0)) {
    const zeroId = [...positions.entries()].find(([_, pos]) => pos === 0)?.[0];
    if (zeroId) entries.push([zeroId, 0]);
  }

  entries.sort((a, b) => a[1] - b[1]);

  const result = new Map<string, number>();

  // First item always at position 0 (this enforces the frame 0 constraint)
  for (let i = 0; i < entries.length; i++) {
    const [id, originalPos] = entries[i];

    if (i === 0) {
      result.set(id, 0);
    } else {
      const prevPos = result.get(entries[i - 1][0]) ?? 0;
      const prevOriginalPos = entries[i - 1][1];

      const originalGap = originalPos - prevOriginalPos;
      const desiredGap = Math.max(originalGap, MIN_GAP);
      const quantizedDesiredGap = skipQuantization ? desiredGap : quantizeGap(desiredGap, MIN_GAP);
      const constrainedGap = Math.min(quantizedDesiredGap, maxGap);
      const finalGap = skipQuantization ? constrainedGap : quantizeGap(constrainedGap, MIN_GAP);

      result.set(id, prevPos + finalGap);
    }
  }

  // Re-add excluded id unchanged
  if (excludeId && positions.has(excludeId)) {
    result.set(excludeId, positions.get(excludeId)!);
  }

  // Re-add trailing endpoint unchanged
  if (trailingValue !== undefined) {
    result.set(TRAILING_ENDPOINT_KEY, trailingValue);
  }

  return result;
};

// ---------------------------------------------------------------------------
// Apply fluid timeline behavior with movement limiting
// ---------------------------------------------------------------------------
export const applyFluidTimeline = (
  positions: Map<string, number>,
  draggedId: string,
  targetFrame: number,
  excludeId?: string,
  _fullMin: number = 0,
  _fullMax: number = Number.MAX_SAFE_INTEGER,
  skipQuantization: boolean = false,
): Map<string, number> => {
  const originalPos = positions.get(draggedId) ?? 0;
  const movementAmount = targetFrame - originalPos;

  // Limit movement to 50 frames per drag for natural feel
  const maxSingleMove = 50;
  const limitedMovement = Math.max(-maxSingleMove, Math.min(maxSingleMove, movementAmount));
  const limitedTargetFrame = originalPos + limitedMovement;

  const result = new Map(positions);
  result.set(draggedId, limitedTargetFrame);

  // Apply gap constraints (this also handles frame 0 enforcement)
  return shrinkOversizedGaps(result, excludeId, skipQuantization);
};

// Convert pixel position to frame number
export const pixelToFrame = (pixelX: number, containerWidth: number, fullMin: number, fullRange: number): number => {
  const fraction = pixelX / containerWidth;
  return Math.round(fullMin + fraction * fullRange);
};

// ---------------------------------------------------------------------------
// Multi-select bundling: bundle selected items 5 frames apart
// ---------------------------------------------------------------------------
const BUNDLE_GAP = 5;

export const applyFluidTimelineMulti = (
  positions: Map<string, number>,
  selectedIds: string[],
  targetFrame: number,
  skipQuantization: boolean = false,
): Map<string, number> => {
  if (selectedIds.length === 0) return positions;
  if (selectedIds.length === 1) {
    return applyFluidTimeline(positions, selectedIds[0], targetFrame, undefined, 0, Number.MAX_SAFE_INTEGER, skipQuantization);
  }

  const result = new Map(positions);

  // Sort selected items by current position to preserve relative order
  const selectedWithPositions = selectedIds
    .map(id => ({ id, frame: positions.get(id) ?? 0 }))
    .sort((a, b) => a.frame - b.frame);

  // Place selected items 5 frames apart
  selectedWithPositions.forEach((item, index) => {
    result.set(item.id, targetFrame + (index * BUNDLE_GAP));
  });

  // Push out non-selected items that are within the bundle range
  const bundleEnd = targetFrame + ((selectedIds.length - 1) * BUNDLE_GAP);
  const nonSelectedItems = [...positions.entries()]
    .filter(([id]) => !selectedIds.includes(id));

  nonSelectedItems.forEach(([id, pos]) => {
    if (pos >= targetFrame && pos <= bundleEnd) {
      result.set(id, bundleEnd + BUNDLE_GAP);
    }
  });

  // Apply gap constraints (handles frame 0 enforcement)
  return shrinkOversizedGaps(result, undefined, skipQuantization);
};
