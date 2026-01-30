/**
 * Timeline Normalization Utility
 *
 * Normalizes timeline positions after delete operations to:
 * 1. Shift timeline to start at frame 0
 * 2. Compress any gaps exceeding MAX_GAP (81 frames) down to MAX_GAP
 *
 * This ensures the timeline doesn't have orphaned positions far from 0
 * and maintains consistent spacing constraints.
 */

export const MAX_FRAME_GAP = 81;

export interface TimelineFrame {
  shotGenerationId: string;
  currentFrame: number;
}

export interface NormalizationResult {
  /** The original minimum frame (what was subtracted to normalize) */
  offset: number;
  /** List of position updates to apply */
  updates: Array<{ shotGenerationId: string; newFrame: number }>;
  /** True if timeline is already normalized (no changes needed) */
  noChangeNeeded: boolean;
}

/**
 * Calculates the normalization needed to:
 * 1. Start the timeline at frame 0
 * 2. Compress any gaps > MAX_FRAME_GAP down to MAX_FRAME_GAP
 *
 * @param frames - Array of timeline frames with their current positions
 * @returns NormalizationResult with updates to apply (or noChangeNeeded if already normalized)
 *
 * @example
 * // Frames at [50, 100, 150] -> normalized to [0, 50, 100]
 * // Frames at [0, 150, 200] with gap 150 -> normalized to [0, 81, 131]
 * // Frames at [50, 200, 250] -> normalized to [0, 81, 131] (both shift and compress)
 */
export function calculateNormalization(frames: TimelineFrame[]): NormalizationResult {
  if (frames.length === 0) {
    return { offset: 0, updates: [], noChangeNeeded: true };
  }

  // Sort frames by position
  const sorted = [...frames].sort((a, b) => a.currentFrame - b.currentFrame);

  const minFrame = sorted[0].currentFrame;

  // Check if any gap exceeds MAX_FRAME_GAP
  let hasLargeGap = false;
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].currentFrame - sorted[i - 1].currentFrame;
    if (gap > MAX_FRAME_GAP) {
      hasLargeGap = true;
      break;
    }
  }

  // If already starts at 0 and no large gaps, no normalization needed
  if (minFrame === 0 && !hasLargeGap) {
    return { offset: 0, updates: [], noChangeNeeded: true };
  }

  // Calculate new positions:
  // - First frame goes to 0
  // - Each subsequent frame: previous + min(originalGap, MAX_FRAME_GAP)
  const updates: Array<{ shotGenerationId: string; newFrame: number }> = [];
  let currentPosition = 0;

  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      updates.push({
        shotGenerationId: sorted[i].shotGenerationId,
        newFrame: 0
      });
      currentPosition = 0;
    } else {
      const originalGap = sorted[i].currentFrame - sorted[i - 1].currentFrame;
      const newGap = Math.min(originalGap, MAX_FRAME_GAP);
      currentPosition += newGap;
      updates.push({
        shotGenerationId: sorted[i].shotGenerationId,
        newFrame: currentPosition
      });
    }
  }

  return { offset: minFrame, updates, noChangeNeeded: false };
}
