/** Default/max spacing when no existing items to calculate average from */
export const DEFAULT_FRAME_SPACING = 50;

/** Minimum spacing to use even if average is lower (prevents overly tight timelines) */
const MIN_FRAME_SPACING = 10;

export const calculateAverageSpacing = (
  existingFrames: number[],
  defaultSpacing: number = DEFAULT_FRAME_SPACING
): number => {
  // Need at least 2 items to calculate spacing
  if (existingFrames.length < 2) {
    return defaultSpacing;
  }
  
  const sortedFrames = [...existingFrames].sort((a, b) => a - b);
  const minFrame = sortedFrames[0];
  const maxFrame = sortedFrames[sortedFrames.length - 1];
  
  const totalSpan = maxFrame - minFrame;
  const numGaps = sortedFrames.length - 1;
  const averageSpacing = Math.round(totalSpan / numGaps);

  return Math.min(DEFAULT_FRAME_SPACING, Math.max(MIN_FRAME_SPACING, averageSpacing));
};

export const ensureUniqueFrame = (
  targetFrame: number,
  existingFrames: number[],
  minGap: number = 1
): number => {
  // Normalize to integer
  const frame = Math.max(0, Math.round(targetFrame));
  
  // If no collision, return as-is
  if (!existingFrames.includes(frame)) {
    return frame;
  }
  
  let offset = 1;
  const maxOffset = 1000; // Safety limit

  while (offset < maxOffset) {
    const higher = frame + offset;
    if (!existingFrames.includes(higher)) {
      return higher;
    }

    const lower = frame - offset;
    if (lower >= 0 && !existingFrames.includes(lower)) {
      return lower;
    }
    
    offset += minGap;
  }
  
  const maxFrame = existingFrames.length > 0 ? Math.max(...existingFrames) : 0;
  const fallback = maxFrame + DEFAULT_FRAME_SPACING;
  return fallback;
};

interface DuplicateFrameOptions {
  currentFrame: number;
  nextFrame?: number | null;
  existingFrames: number[];
  singleItemTrailingFrame?: number | null;
  isSingleItem: boolean;
  defaultDuplicateGap?: number;
  defaultSingleItemTrailingGap?: number;
}

export const calculateDuplicateFrame = (options: DuplicateFrameOptions): number => {
  const {
    currentFrame,
    nextFrame,
    existingFrames,
    singleItemTrailingFrame,
    isSingleItem,
    defaultDuplicateGap = 30,
    defaultSingleItemTrailingGap = 49,
  } = options;

  const baseTarget = isSingleItem
    ? (singleItemTrailingFrame ?? (currentFrame + defaultSingleItemTrailingGap))
    : (typeof nextFrame === 'number'
      ? Math.floor((currentFrame + nextFrame) / 2)
      : currentFrame + defaultDuplicateGap);

  return ensureUniqueFrame(baseTarget, existingFrames);
};

export const calculateFrameForIndex = (
  index: number,
  existingFrames: number[],
  explicitSpacing?: number
): number => {
  const sortedFrames = [...existingFrames].sort((a, b) => a - b);
  
  let targetFrame: number;
  
  if (sortedFrames.length === 0) {
    // Empty timeline - start at 0
    targetFrame = 0;
  } else if (index === 0) {
    // Inserting at beginning - use half of first frame
    const firstFrame = sortedFrames[0];
    targetFrame = Math.max(0, Math.floor(firstFrame / 2));
  } else if (index >= sortedFrames.length) {
    // Inserting at end - use average spacing or explicit
    const spacing = explicitSpacing ?? calculateAverageSpacing(sortedFrames);
    const lastFrame = sortedFrames[sortedFrames.length - 1];
    targetFrame = lastFrame + spacing;
  } else {
    // Inserting in middle - use midpoint between neighbors
    const prevFrame = sortedFrames[index - 1];
    const nextFrame = sortedFrames[index];
    targetFrame = Math.floor((prevFrame + nextFrame) / 2);
  }
  
  // Ensure the calculated frame is unique
  return ensureUniqueFrame(targetFrame, sortedFrames);
};

export const calculateNextAvailableFrame = (
  existingFrames: number[],
  explicitSpacing?: number
): number => {
  if (existingFrames.length === 0) {
    return 0;
  }
  
  const spacing = explicitSpacing ?? calculateAverageSpacing(existingFrames);
  
  const maxFrame = Math.max(...existingFrames);
  const targetFrame = maxFrame + spacing;
  
  return ensureUniqueFrame(targetFrame, existingFrames);
};

export const extractExistingFrames = (
  items: Array<{ timeline_frame?: number | null; type?: string | null }>
): number[] => {
  return items
    .filter(item => {
      // Filter out videos
      if (item.type === 'video') return false;
      // Filter out null/undefined frames
      if (item.timeline_frame == null) return false;
      // Filter out unpositioned items (timeline_frame === -1)
      if (item.timeline_frame === -1) return false;
      return true;
    })
    .map(item => item.timeline_frame as number);
};
