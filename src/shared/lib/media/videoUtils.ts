/** Shared video/frame utility helpers. */

const FPS = 16;

// Wan models require frame counts in the form 4N + 1.

export function isValidFrameCount(frames: number): boolean {
  return frames > 0 && (frames - 1) % 4 === 0;
}

export function quantizeFrameCount(frames: number, minFrames: number = 1): number {
  const validMin = Math.max(1, Math.ceil((minFrames - 1) / 4) * 4 + 1);

  if (frames <= validMin) return validMin;

  const quantizationFactor = Math.round((frames - 1) / 4);
  const quantized = quantizationFactor * 4 + 1;

  return Math.max(validMin, quantized);
}


export function getValidFrameCounts(minFrames: number, maxFrames: number): number[] {
  const counts: number[] = [];
  let current = Math.ceil((minFrames - 1) / 4) * 4 + 1;
  if (current < minFrames) current += 4;

  while (current <= maxFrames) {
    counts.push(current);
    current += 4;
  }
  return counts;
}

export function quantizeGap(gap: number, minGap: number = 5): number {
  return quantizeFrameCount(Math.max(gap, minGap), minGap);
}

export function framesToSeconds(frame: number): string {
  const seconds = frame / FPS;
  return `${seconds.toFixed(2)}s`;
}

export function framesToSecondsValue(frame: number): number {
  return frame / FPS;
}
