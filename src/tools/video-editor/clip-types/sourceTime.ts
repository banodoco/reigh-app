/** Ordinary timeline placement/source trim/rate, independent of scene internals. */
export function clipSourceTime(clip: { at: number; from?: number; speed?: number }, compositionTime: number): number {
  const speed = typeof clip.speed === 'number' && Number.isFinite(clip.speed) && clip.speed > 0 ? clip.speed : 1;
  return (clip.from ?? 0) + Math.max(0, compositionTime - clip.at) * speed;
}
