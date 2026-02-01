import { quantizeGap, isValidFrameCount } from "./time-utils";

// Calculate max gap based on context frames (81 frames default)
export const calculateMaxGap = (contextFrames: number = 0, baseMax: number = 81): number => {
  return Math.max(1, baseMax - (contextFrames * 2));
};

// Minimum gap between frames (4N+1 format, starting at 5)
const MIN_GAP = 5;

// Validate gap constraints
export const validateGaps = (
  testPositions: Map<string, number>,
  excludeId?: string,
  checkQuantization: boolean = false
): boolean => {
  const positions = [...testPositions.entries()]
    .filter(([id]) => id !== excludeId)
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
export const shrinkOversizedGaps = (
  positions: Map<string, number>,
  excludeId?: string,
  skipQuantization: boolean = false,
): Map<string, number> => {
  const maxGap = calculateMaxGap();

  const entries = [...positions.entries()].filter(([id]) => id !== excludeId);

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

// Find closest valid position using binary search
export const findClosestValidPosition = (
  targetFrame: number,
  activeId: string,
  framePositions: Map<string, number>,
): number => {
  const originalPos = framePositions.get(activeId) ?? 0;

  const validateWithFrame0Logic = (testFrame: number): boolean => {
    const testMap = new Map(framePositions);
    testMap.set(activeId, testFrame);

    if (originalPos === 0 && testFrame !== 0) {
      const nearest = [...testMap.entries()]
        .filter(([id]) => id !== activeId)
        .sort((a, b) => a[1] - b[1])[0];
      if (nearest) {
        testMap.set(nearest[0], 0);
      }
    }

    return validateGaps(testMap);
  };

  if (validateWithFrame0Logic(targetFrame)) {
    return targetFrame;
  }

  // Binary search for closest valid position
  const direction = targetFrame > originalPos ? 1 : -1;
  let low = Math.min(originalPos, targetFrame);
  let high = Math.max(originalPos, targetFrame);
  let best = originalPos;
  let iterations = 0;

  while (low <= high && iterations < 20) {
    const mid = Math.round((low + high) / 2);
    iterations++;

    if (validateWithFrame0Logic(mid)) {
      best = mid;
      if (direction > 0) {
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    } else {
      if (direction > 0) {
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }
  }

  return best;
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
export const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(value, max));
};

// Get pair information from positions
export const getPairInfo = (framePositions: Map<string, number>) => {
  const sortedPositions = [...framePositions.entries()]
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
