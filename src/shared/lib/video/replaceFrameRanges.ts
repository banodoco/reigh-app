import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';

export interface ReplaceFrameRangeSelection {
  start_frame: number;
  end_frame: number;
  start_time: number;
  end_time: number;
  frame_count: number;
  gap_frame_count: number;
  prompt: string;
}

interface FrameRangeBoundary {
  start_frame: number;
  end_frame: number;
}

export function selectionsToFrameRanges(
  selections: PortionSelection[],
  fps: number,
  totalDuration: number,
  globalGapFrameCount: number,
  globalPrompt: string,
): ReplaceFrameRangeSelection[] {
  const totalFrames = Math.round(totalDuration * fps);

  return selections.map((selection) => {
    const startFrame = Math.max(0, Math.round(selection.start * fps));
    const endFrame = Math.min(totalFrames, Math.round(selection.end * fps));
    return {
      start_frame: startFrame,
      end_frame: endFrame,
      start_time: selection.start,
      end_time: selection.end,
      frame_count: endFrame - startFrame,
      gap_frame_count: selection.gapFrameCount ?? globalGapFrameCount,
      prompt: selection.prompt || globalPrompt,
    };
  });
}

function getMinKeeperFrames(
  totalFrames: number,
  frameRanges: FrameRangeBoundary[],
): number {
  const sortedPortions = [...frameRanges].sort((a, b) => a.start_frame - b.start_frame);
  let minKeeperFrames = totalFrames;

  if (sortedPortions.length > 0) {
    const firstKeeperLength = sortedPortions[0].start_frame;
    if (firstKeeperLength > 0) {
      minKeeperFrames = Math.min(minKeeperFrames, firstKeeperLength);
    }
  }

  for (let i = 0; i < sortedPortions.length - 1; i += 1) {
    const keeperLength = sortedPortions[i + 1].start_frame - sortedPortions[i].end_frame;
    if (keeperLength > 0) {
      minKeeperFrames = Math.min(minKeeperFrames, keeperLength);
    }
  }

  if (sortedPortions.length > 0) {
    const lastKeeperLength = totalFrames - sortedPortions[sortedPortions.length - 1].end_frame;
    if (lastKeeperLength > 0) {
      minKeeperFrames = Math.min(minKeeperFrames, lastKeeperLength);
    }
  }

  return minKeeperFrames;
}

export function calculateMaxContextFrames({
  videoFps,
  videoDuration,
  frameRanges,
}: {
  videoFps: number | null;
  videoDuration: number;
  frameRanges: FrameRangeBoundary[];
}): number {
  if (!videoFps || !videoDuration || frameRanges.length === 0) {
    return 30;
  }

  const totalFrames = Math.round(videoDuration * videoFps);
  const minKeeperFrames = getMinKeeperFrames(totalFrames, frameRanges);
  return Math.max(4, minKeeperFrames - 1);
}

export function capContextFrameCountForRanges({
  contextFrameCount,
  totalFrames,
  frameRanges,
}: {
  contextFrameCount: number;
  totalFrames: number;
  frameRanges: FrameRangeBoundary[];
}): number {
  const minKeeperFrames = getMinKeeperFrames(totalFrames, frameRanges);
  const safeMaxContextFrames = Math.max(1, minKeeperFrames - 1);
  return Math.min(contextFrameCount, safeMaxContextFrames);
}
