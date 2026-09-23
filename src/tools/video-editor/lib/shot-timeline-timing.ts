export const SHOT_TIMELINE_TIMING_EVENT = 'shot-timeline:timing';

export type ShotTimelineTimingDetail = Readonly<{
  traceId: string;
  phase: string;
  at: number;
  [key: string]: unknown;
}>;

/** Development-only correlated phase evidence for the shot popup save path. */
export function recordShotTimelinePhase(
  traceId: string,
  phase: string,
  detail: Record<string, unknown> = {},
): void {
  if (!import.meta.env.DEV) return;
  const at = performance.now();
  const event: ShotTimelineTimingDetail = { traceId, phase, at, ...detail };
  console.debug('[ShotTimelineLatency]', event);
  if (typeof globalThis.dispatchEvent === 'function' && typeof CustomEvent !== 'undefined') {
    globalThis.dispatchEvent(new CustomEvent(SHOT_TIMELINE_TIMING_EVENT, { detail: event }));
  }
}
