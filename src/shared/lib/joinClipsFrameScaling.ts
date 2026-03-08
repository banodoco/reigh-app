interface ScaleJoinFrameCountsInput {
  contextFrameCount: number;
  gapFrameCount: number;
  shortestClipFrames: number | null | undefined;
}

interface ScaleJoinFrameCountsOutput {
  contextFrameCount: number;
  gapFrameCount: number;
}

export function scaleJoinFrameCountsToShortestClip({
  contextFrameCount,
  gapFrameCount,
  shortestClipFrames,
}: ScaleJoinFrameCountsInput): ScaleJoinFrameCountsOutput {
  if (!shortestClipFrames || shortestClipFrames <= 0) {
    return { contextFrameCount, gapFrameCount };
  }

  const framesNeeded = gapFrameCount + 2 * contextFrameCount;
  if (framesNeeded <= shortestClipFrames) {
    return { contextFrameCount, gapFrameCount };
  }

  const scale = shortestClipFrames / framesNeeded;
  return {
    contextFrameCount: Math.max(4, Math.floor(contextFrameCount * scale)),
    gapFrameCount: Math.max(1, Math.floor(gapFrameCount * scale)),
  };
}
