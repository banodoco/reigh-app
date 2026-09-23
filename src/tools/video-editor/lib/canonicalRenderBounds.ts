import { getClipTimelineDuration } from '@/tools/video-editor/lib/config-utils.ts';
import type { ResolvedTimelineClip } from '@/tools/video-editor/types/index.ts';

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

/**
 * Bound a canonical projected clip to its occurrence's half-open interval.
 * This happens before preview/export sequence construction, so audio, visual,
 * effect, transition, overlap, and premount consumers share one boundary.
 */
export function boundCanonicalClipToOccurrence(
  clip: ResolvedTimelineClip,
): ResolvedTimelineClip | null {
  if (clip.enabled === false || clip.active === false || clip.disabled === true
    || clip.hidden === true || clip.deleted === true) return null;
  const app = record(clip.app);
  const timing = record(app?.canonicalTiming);
  const occurrenceStartMs = timing?.occurrenceStartMs;
  const occurrenceDurationMs = timing?.occurrenceDurationMs;
  if (typeof occurrenceStartMs !== 'number' || !Number.isFinite(occurrenceStartMs)
    || typeof occurrenceDurationMs !== 'number' || !Number.isFinite(occurrenceDurationMs)) {
    return clip;
  }

  const occurrenceStart = Math.max(0, occurrenceStartMs / 1000);
  const occurrenceEnd = occurrenceStart + Math.max(0, occurrenceDurationMs / 1000);
  const start = Math.max(occurrenceStart, clip.at);
  if (start >= occurrenceEnd) return null;

  const duration = Math.min(getClipTimelineDuration(clip), occurrenceEnd - start);
  if (duration <= 0) return null;

  const speed = typeof clip.speed === 'number' && clip.speed > 0 ? clip.speed : 1;
  const nextClip: ResolvedTimelineClip = {
    ...clip,
    at: start,
    ...(typeof clip.hold === 'number'
      ? { hold: duration * speed }
      : typeof clip.from === 'number' && typeof clip.to === 'number'
        ? { to: clip.from + duration * speed }
        : { hold: duration }),
  };
  if (clip.transition) {
    const transitionDuration = Math.min(
      Math.max(0, clip.transition.duration),
      Math.max(0, start - occurrenceStart),
    );
    nextClip.transition = transitionDuration > 0
      ? { ...clip.transition, duration: transitionDuration }
      : undefined;
  }
  return nextClip;
}

export function boundCanonicalConfigClips(
  clips: readonly ResolvedTimelineClip[],
): ResolvedTimelineClip[] {
  return clips.flatMap((clip) => {
    const bounded = boundCanonicalClipToOccurrence(clip);
    return bounded ? [bounded] : [];
  });
}
