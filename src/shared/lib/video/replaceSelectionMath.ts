import type { PortionSelection } from '@/shared/components/VideoPortionTimeline';

const DEFAULT_SELECTION_START_RATIO = 0.1;
const DEFAULT_SELECTION_END_RATIO = 0.2;
const FALLBACK_SELECTION_START_RATIO = 0.4;
const FALLBACK_SELECTION_END_RATIO = 0.5;
const NEW_SELECTION_WIDTH_RATIO = 0.1;
const NEW_SELECTION_GAP_RATIO = 0.1;

function quantizeGapFramesFromDuration(duration: number, fps: number): number {
  const frameCount = Math.round(duration * fps);
  return quantizeGapFrameCount(frameCount);
}

function getMaxGapFramesForContext(contextFrameCount: number): number {
  return Math.max(1, 81 - (contextFrameCount * 2));
}

export function quantizeGapFrameCount(frameCount: number): number {
  const n = Math.round((frameCount - 1) / 4);
  return Math.max(1, n * 4 + 1);
}

export function calculateGapFramesFromRange({
  start,
  end,
  fps,
  fallbackGapFrameCount,
  contextFrameCount,
}: {
  start: number;
  end: number;
  fps: number | null;
  fallbackGapFrameCount: number;
  contextFrameCount: number;
}): number {
  if (!fps || end <= start) {
    return fallbackGapFrameCount;
  }

  const quantized = quantizeGapFramesFromDuration(end - start, fps);
  return Math.min(quantized, getMaxGapFramesForContext(contextFrameCount));
}

export function getDefaultSelectionRange(videoDuration: number): { start: number; end: number } {
  return {
    start: videoDuration * DEFAULT_SELECTION_START_RATIO,
    end: videoDuration * DEFAULT_SELECTION_END_RATIO,
  };
}

export function getNewSelectionRange(
  selections: PortionSelection[],
  videoDuration: number,
): { start: number; end: number } {
  const sortedSelections = [...selections].sort((a, b) => a.end - b.end);
  const lastSelection = sortedSelections[sortedSelections.length - 1];
  if (!lastSelection) {
    return getDefaultSelectionRange(videoDuration);
  }

  const selectionWidth = videoDuration * NEW_SELECTION_WIDTH_RATIO;
  const gap = videoDuration * NEW_SELECTION_GAP_RATIO;

  const afterStart = lastSelection.end + gap;
  const afterEnd = afterStart + selectionWidth;
  if (afterEnd <= videoDuration) {
    return { start: afterStart, end: afterEnd };
  }

  const firstSelection = sortedSelections[0];
  const beforeEnd = firstSelection.start - gap;
  const beforeStart = beforeEnd - selectionWidth;
  if (beforeStart >= 0) {
    return { start: beforeStart, end: beforeEnd };
  }

  return {
    start: videoDuration * FALLBACK_SELECTION_START_RATIO,
    end: videoDuration * FALLBACK_SELECTION_END_RATIO,
  };
}

export function validatePortionSelections({
  selections,
  videoFps,
  videoDuration,
}: {
  selections: PortionSelection[];
  videoFps: number | null;
  videoDuration: number;
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (selections.length === 0) {
    errors.push('No portions selected');
    return { isValid: false, errors };
  }

  if (videoFps === null) {
    errors.push('Video FPS not detected yet');
    return { isValid: false, errors };
  }

  for (let i = 0; i < selections.length; i += 1) {
    const selection = selections[i];
    const selNum = selections.length > 1 ? ` #${i + 1}` : '';

    if (selection.start >= selection.end) {
      errors.push(`Portion${selNum}: Start must be before end`);
    }

    const duration = selection.end - selection.start;
    if (duration < 0.1) {
      errors.push(`Portion${selNum}: Too short (min 0.1s)`);
    }

    if (selection.start < 0) {
      errors.push(`Portion${selNum}: Starts before video`);
    }
    if (selection.end > videoDuration) {
      errors.push(`Portion${selNum}: Extends past video end`);
    }
  }

  if (selections.length > 1) {
    const sorted = [...selections].sort((a, b) => a.start - b.start);
    for (let i = 0; i < sorted.length - 1; i += 1) {
      if (sorted[i].end > sorted[i + 1].start) {
        errors.push('Portions overlap');
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}
