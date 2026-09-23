type JsonObject = Record<string, unknown>;

function record(value: unknown): JsonObject | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function nonNegative(value: number | undefined): number {
  return value !== undefined && value > 0 ? value : 0;
}

function secondsToMilliseconds(value: unknown): number {
  return nonNegative(finiteNumber(value)) * 1000;
}

function playbackSpeed(rawClip: JsonObject): number {
  const speed = finiteNumber(rawClip.speed);
  return speed !== undefined && speed > 0 ? speed : 1;
}

/**
 * Disabled/hidden/deleted child clips do not contribute authored shot time.
 * Muted clips still have a temporal footprint: muting controls output level,
 * not whether the clip exists on the internal timeline.
 */
export function isActiveTimelineClip(rawClip: unknown): rawClip is JsonObject {
  const clip = record(rawClip);
  if (!clip) return false;
  if (clip.enabled === false || clip.active === false || clip.disabled === true || clip.hidden === true || clip.deleted === true) {
    return false;
  }
  const clipType = clip.clip_type ?? clip.clipType;
  return clipType !== 'gap' && clipType !== 'spacer';
}

export function timelineClipStartMs(rawClip: unknown): number {
  const clip = record(rawClip);
  if (!clip) return 0;
  const atMs = finiteNumber(clip.at_ms);
  return atMs !== undefined ? nonNegative(atMs) : secondsToMilliseconds(clip.at);
}

export function timelineClipDurationMs(rawClip: unknown): number {
  const clip = record(rawClip);
  if (!clip) return 0;

  const durationMs = finiteNumber(clip.duration_ms);
  if (durationMs !== undefined) return nonNegative(durationMs) / playbackSpeed(clip);

  const durationSeconds = finiteNumber(clip.duration);
  if (durationSeconds !== undefined) return secondsToMilliseconds(durationSeconds) / playbackSpeed(clip);

  const holdSeconds = finiteNumber(clip.hold);
  if (holdSeconds !== undefined) return secondsToMilliseconds(holdSeconds) / playbackSpeed(clip);

  const from = finiteNumber(clip.from);
  const to = finiteNumber(clip.to);
  if (from !== undefined && to !== undefined && to > from) {
    return secondsToMilliseconds((to - from) / playbackSpeed(clip));
  }

  return 0;
}

export function timelineClipEndMs(rawClip: unknown): number {
  return timelineClipStartMs(rawClip) + timelineClipDurationMs(rawClip);
}

/**
 * Return the authored end of the internal timeline. The result is an integer
 * millisecond boundary and is intentionally zero for a contentless timeline.
 */
export function timelineContentExtentMs(timeline: unknown): number {
  const clips = record(timeline)?.clips;
  if (!Array.isArray(clips)) return 0;
  const furthestEndMs = clips.reduce(
    (maximum, rawClip) => isActiveTimelineClip(rawClip)
      ? Math.max(maximum, timelineClipEndMs(rawClip))
      : maximum,
    0,
  );
  return Math.max(0, Math.ceil(furthestEndMs - 1e-6));
}

/** Resolve an occurrence's authored duration without trusting stored tail time. */
export function timelineOccurrenceContentExtentMs(occurrence: unknown): number | undefined {
  const value = record(occurrence);
  const revision = record(value?.revision);
  const internal = record(revision?.internal_timeline_revision);
  if (!internal || !Object.prototype.hasOwnProperty.call(internal, 'timeline')) return undefined;
  return timelineContentExtentMs(internal.timeline);
}

function occurrenceLaneKey(rawOccurrence: unknown): string {
  const occurrence = record(rawOccurrence);
  const placement = record(occurrence?.placement);
  const lane = occurrence?.trackId ?? occurrence?.track ?? occurrence?.track_id ?? placement?.track;
  return typeof lane === 'string' && lane.length > 0 ? lane : 'video';
}

function occurrenceAtMs(rawOccurrence: unknown): number {
  const occurrence = record(rawOccurrence);
  return Math.max(0, finiteNumber(occurrence?.atMs ?? occurrence?.at_ms) ?? 0);
}

function occurrenceIdentity(rawOccurrence: unknown): string | undefined {
  const occurrence = record(rawOccurrence);
  const value = occurrence?.occurrenceId ?? occurrence?.occurrence_id;
  return typeof value === 'string' ? value : undefined;
}

/** Return the relative half-open duration before the next same-lane occurrence. */
export function timelineOccurrenceHardDurationMs(
  occurrence: unknown,
  occurrences: readonly unknown[],
): number | undefined {
  const occurrenceId = occurrenceIdentity(occurrence);
  const startMs = occurrenceAtMs(occurrence);
  const lane = occurrenceLaneKey(occurrence);
  const nextStartMs = occurrences
    .filter((candidate) => occurrenceIdentity(candidate) !== occurrenceId)
    .filter((candidate) => occurrenceLaneKey(candidate) === lane)
    .map(occurrenceAtMs)
    .filter((candidateStartMs) => candidateStartMs >= startMs)
    .sort((left, right) => left - right)[0];
  return nextStartMs === undefined ? undefined : Math.max(0, nextStartMs - startMs);
}

/** Content-derived duration capped at the next same-lane hard blocker. */
export function timelineOccurrenceEffectiveDurationMs(
  occurrence: unknown,
  occurrences: readonly unknown[],
  contentDurationMs: number,
): number {
  const contentDuration = Math.max(0, contentDurationMs);
  const hardDuration = timelineOccurrenceHardDurationMs(occurrence, occurrences);
  return hardDuration === undefined ? contentDuration : Math.min(contentDuration, hardDuration);
}
