/**
 * Host-owned, runtime-only editability contract.
 *
 * Clip/track locks are deliberately not added to the vendor timeline schema:
 * they are session/permission state owned by the host and must not be
 * serialized as managed metadata. Callers must check this guard again at
 * commit time because a lock may change while a pointer gesture is active.
 */
export type TimelineEditabilityReason = 'timeline_read_only' | 'clip_locked' | 'track_locked' | 'shot_hard_duration_limit';

export interface TimelineEditabilityResult {
  allowed: boolean;
  reason?: TimelineEditabilityReason;
  /** Optional clamped start used by a visual reject preview. */
  maxStart?: number;
}

export interface TimelineEditability {
  /**
   * Optional hard end used by timeline interactions as a snap target. This is
   * deliberately runtime-only; it is not part of the persisted timeline.
   */
  readonly hardDurationSeconds?: number;
  /** Optional whole-document guard evaluated at the shared edit/history boundary. */
  checkTimeline?(): TimelineEditabilityResult;
  check(input: {
    clipId: string;
    sourceTrackId: string | null;
    targetTrackId: string | null;
  }): TimelineEditabilityResult;
  checkMove?(input: {
    clipId: string;
    sourceTrackId: string | null;
    targetTrackId: string | null;
    start: number;
    duration: number;
  }): TimelineEditabilityResult;
}

export interface TimelineEditabilityOptions {
  readOnly?: boolean;
  lockedClipIds?: Iterable<string>;
  lockedTrackIds?: Iterable<string>;
  hardDurationSeconds?: number;
}

export function createTimelineEditability(options: TimelineEditabilityOptions = {}): TimelineEditability {
  const lockedClipIds = new Set(options.lockedClipIds ?? []);
  const lockedTrackIds = new Set(options.lockedTrackIds ?? []);
  return {
    hardDurationSeconds: options.hardDurationSeconds,
    check({ clipId, sourceTrackId, targetTrackId }) {
      if (options.readOnly) return { allowed: false, reason: 'timeline_read_only' };
      if (lockedClipIds.has(clipId)) return { allowed: false, reason: 'clip_locked' };
      if ((sourceTrackId && lockedTrackIds.has(sourceTrackId)) || (targetTrackId && lockedTrackIds.has(targetTrackId))) {
        return { allowed: false, reason: 'track_locked' };
      }
      return { allowed: true };
    },
    checkMove({ duration, start }) {
      if (
        typeof options.hardDurationSeconds === 'number'
        && Number.isFinite(options.hardDurationSeconds)
        && start + duration > options.hardDurationSeconds + 0.0001
      ) {
        return {
          allowed: false,
          reason: 'shot_hard_duration_limit',
          maxStart: Math.max(0, options.hardDurationSeconds - duration),
        };
      }
      return { allowed: true };
    },
  };
}

export const allowTimelineEdits: TimelineEditability = {
  check: () => ({ allowed: true }),
  checkMove: () => ({ allowed: true }),
};
