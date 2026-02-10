import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';

/** Frame-accurate selection sent to the backend */
interface FrameRangeSelection {
  start_frame: number;
  end_frame: number;
  start_time: number;
  end_time: number;
  frame_count: number;
  gap_frame_count: number;
  prompt: string;
}

/** Convert time selections to frame ranges with per-segment settings */
export function selectionsToFrameRanges(
  selections: PortionSelection[],
  fps: number,
  totalDuration: number,
  globalGapFrameCount: number,
  globalPrompt: string
): FrameRangeSelection[] {
  const totalFrames = Math.round(totalDuration * fps);

  return selections.map(selection => {
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
