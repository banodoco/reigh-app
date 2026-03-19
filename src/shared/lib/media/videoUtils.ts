/** Shared video/frame utility helpers. */

const DEFAULT_FPS = 16;
const DEFAULT_FRAME_STEP = 4;

function quantizeMinimumFrameCount(minFrames: number, step: number): number {
  const normalizedStep = Math.max(1, step);
  return Math.max(1, Math.ceil((minFrames - 1) / normalizedStep) * normalizedStep + 1);
}

export function isValidFrameCount(frames: number, step: number = DEFAULT_FRAME_STEP): boolean {
  return frames > 0 && (frames - 1) % step === 0;
}

export function quantizeFrameCount(
  frames: number,
  minFrames: number = 1,
  step: number = DEFAULT_FRAME_STEP,
): number {
  const validMin = quantizeMinimumFrameCount(minFrames, step);

  if (frames <= validMin) return validMin;

  const quantizationFactor = Math.round((frames - 1) / step);
  const quantized = quantizationFactor * step + 1;

  return Math.max(validMin, quantized);
}


export function getValidFrameCounts(
  minFrames: number,
  maxFrames: number,
  step: number = DEFAULT_FRAME_STEP,
): number[] {
  const counts: number[] = [];
  let current = quantizeMinimumFrameCount(minFrames, step);

  while (current <= maxFrames) {
    counts.push(current);
    current += step;
  }
  return counts;
}

export function quantizeGap(gap: number, minGap: number = 5, step: number = DEFAULT_FRAME_STEP): number {
  return quantizeFrameCount(Math.max(gap, minGap), minGap, step);
}

export function framesToSeconds(frame: number, fps: number = DEFAULT_FPS): string {
  const seconds = frame / fps;
  return `${seconds.toFixed(2)}s`;
}

export function framesToSecondsValue(frame: number, fps: number = DEFAULT_FPS): number {
  return frame / fps;
}
