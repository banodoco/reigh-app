import { quantizeGap, isValidFrameCount } from "./time-utils";

// The trailing endpoint key — lives in the positions map but is not a real image
export const TRAILING_ENDPOINT_KEY = '__trailing_endpoint';

// Phantom key for a pending item (duplicate/drop/external add) — used in augmented
// positions maps so pair regions and segment strip can update before the real item arrives
export const PENDING_POSITION_KEY = '__pending__';

// Minimum gap between frames (4N+1 format, starting at 5)
const QUANTIZE_MIN_GAP = 5;

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

  const entries = [...imagePositions.entries()].sort((a, b) => a[1] - b[1]);

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
    const quantizedGap = quantizeGap(Math.max(originalGap, QUANTIZE_MIN_GAP), QUANTIZE_MIN_GAP);
    result.set(id, prevPos + quantizedGap);
  }

  // Re-add trailing endpoint unchanged
  if (trailingValue !== undefined) {
    result.set(TRAILING_ENDPOINT_KEY, trailingValue);
  }

  return result;
};

// Calculate max gap based on context frames (81 frames default)
const calculateMaxGap = (contextFrames: number = 0, baseMax: number = 81): number => {
  return Math.max(1, baseMax - (contextFrames * 2));
};

// Minimum gap between frames (4N+1 format, starting at 5)
const MIN_GAP = 5;

// Validate gap constraints
const validateGaps = (
  testPositions: Map<string, number>,
  excludeId?: string,
  checkQuantization: boolean = false
): boolean => {
  const positions = [...testPositions.entries()]
    .filter(([id]) => id !== excludeId && id !== TRAILING_ENDPOINT_KEY)
    .map(([_, pos]) => pos);
  positions.push(0);
  positions.sort((a, b) => a - b);

  const maxGap = calculateMaxGap();

  for (let i = 1; i < positions.length; i++) {
    const diff = positions[i] - positions[i - 1];
    if (diff > maxGap) return false;
    if (checkQuantization && diff > 0 && !isValidFrameCount(diff)) return false;
  }
  return true;
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
  const maxGap = calculateMaxGap();

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
  fullMin: number = 0,
  fullMax: number = Number.MAX_SAFE_INTEGER,
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

// Calculate timeline dimensions
const MINIMUM_TIMELINE_MAX = 30;

export const getTimelineDimensions = (
  framePositions: Map<string, number>,
  pendingFrames?: (number | null)[]
) => {
  const positions = Array.from(framePositions.values());
  const validPendingFrames = (pendingFrames || []).filter((f): f is number => f !== null && f !== undefined);
  const allPositions = [...positions, ...validPendingFrames];

  if (allPositions.length === 0) {
    return { fullMin: 0, fullMax: MINIMUM_TIMELINE_MAX, fullRange: MINIMUM_TIMELINE_MAX };
  }

  const staticMax = Math.max(...allPositions, 0);
  const staticMin = Math.min(...allPositions, 0);
  const fullMax = Math.max(staticMax, MINIMUM_TIMELINE_MAX);
  const fullMin = Math.min(0, staticMin);
  const fullRange = Math.max(fullMax - fullMin, 1);

  return { fullMin, fullMax, fullRange };
};

// Clamp value between min and max
const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(value, max));
};

// Get pair information from positions (excludes trailing endpoint)
export const getPairInfo = (framePositions: Map<string, number>) => {
  const sortedPositions = [...framePositions.entries()]
    .filter(([id]) => id !== TRAILING_ENDPOINT_KEY)
    .map(([id, pos]) => ({ id, pos }))
    .sort((a, b) => a.pos - b.pos);

  const pairs = [];
  for (let i = 0; i < sortedPositions.length - 1; i++) {
    const startFrame = sortedPositions[i].pos;
    const endFrame = sortedPositions[i + 1].pos;
    const pairFrames = endFrame - startFrame;

    pairs.push({
      index: i,
      startFrame,
      endFrame,
      frames: pairFrames,
      generationStart: startFrame,
      contextStart: endFrame,
      contextEnd: endFrame,
    });
  }

  return pairs;
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

/**
 * Calculate placement for a new structure video on the timeline.
 * Places after the last existing video, clipping the last video if needed to make space.
 *
 * @returns Object with start_frame, end_frame, and optional lastVideoUpdate if clipping is needed
 */
interface VideoPlacementResult {
  start_frame: number;
  end_frame: number;
  lastVideoUpdate?: { index: number; newEndFrame: number };
}

export const calculateNewVideoPlacement = (
  videoFrameCount: number,
  existingVideos: Array<{ path: string; start_frame: number; end_frame: number }> | undefined,
  fullMax: number
): VideoPlacementResult => {
  let start_frame = 0;
  let end_frame = videoFrameCount;
  let lastVideoUpdate: { index: number; newEndFrame: number } | undefined;

  if (existingVideos && existingVideos.length > 0) {
    const sorted = [...existingVideos].sort((a, b) => a.start_frame - b.start_frame);
    const lastVideo = sorted[sorted.length - 1];
    const lastVideoIndex = existingVideos.findIndex(
      v => v.path === lastVideo.path && v.start_frame === lastVideo.start_frame
    );

    start_frame = lastVideo.end_frame;
    end_frame = start_frame + videoFrameCount;

    // If no space on timeline, clip 1/5 of the last video's range
    if (start_frame >= fullMax && lastVideoIndex >= 0) {
      const lastVideoRange = lastVideo.end_frame - lastVideo.start_frame;
      const clipAmount = Math.max(10, Math.floor(lastVideoRange / 5));
      const newLastVideoEnd = lastVideo.end_frame - clipAmount;

      if (newLastVideoEnd > lastVideo.start_frame + 10) {
        lastVideoUpdate = { index: lastVideoIndex, newEndFrame: newLastVideoEnd };
        start_frame = newLastVideoEnd;
        end_frame = start_frame + videoFrameCount;
      }
    }
  }

  return { start_frame, end_frame, lastVideoUpdate };
};

// ---------------------------------------------------------------------------
// Trailing video detection utilities
// ---------------------------------------------------------------------------

/**
 * Extract pair_shot_generation_id from a generation row.
 * Checks the FK column first, then falls back to params for legacy data.
 */
const getPairShotGenerationId = (
  generation: {
    pair_shot_generation_id?: string | null;
    params?: Record<string, unknown> | null;
  }
): string | null => {
  // Check FK column first (new format)
  if (generation.pair_shot_generation_id) {
    return generation.pair_shot_generation_id;
  }

  // Fallback to params (legacy format)
  const params = generation.params;
  if (!params) return null;

  const individualParams = params.individual_segment_params as Record<string, unknown> | undefined;
  return (
    (individualParams?.pair_shot_generation_id as string) ||
    (params.pair_shot_generation_id as string) ||
    null
  );
};

/**
 * Find trailing video info from a list of video outputs.
 * A trailing video is one where pair_shot_generation_id matches the last image's shot_generation_id.
 *
 * @param videoOutputs - Array of generation rows (video outputs)
 * @param lastImageShotGenId - The shot_generation_id of the last image on the timeline
 * @returns Object with hasTrailing boolean and optional videoUrl
 */
export const findTrailingVideoInfo = (
  videoOutputs: Array<{
    type?: string | null;
    location?: string | null;
    pair_shot_generation_id?: string | null;
    params?: Record<string, unknown> | null;
  }>,
  lastImageShotGenId: string | null
): { hasTrailing: boolean; videoUrl: string | null } => {
  if (!videoOutputs || videoOutputs.length === 0 || !lastImageShotGenId) {
    return { hasTrailing: false, videoUrl: null };
  }

  const trailingVideo = videoOutputs.find(gen => {
    // Must be a video with a location (completed)
    if (!gen.type?.includes('video') || !gen.location) return false;
    // Check if pair_shot_generation_id matches the last image
    const pairId = getPairShotGenerationId(gen);
    return pairId === lastImageShotGenId;
  });

  return {
    hasTrailing: !!trailingVideo,
    videoUrl: trailingVideo?.location || null,
  };
};
