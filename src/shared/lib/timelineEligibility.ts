/**
 * Canonical eligibility contract for "timeline-positioned images":
 * - positioned frame (timeline_frame >= 0)
 * - not a video media item
 */

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov'] as const;
const VIDEO_TYPES = new Set(['video', 'video_travel_output']);

export interface TimelineEligibilityInput {
  timeline_frame?: number | null;
  type?: string | null;
  location?: string | null;
  imageUrl?: string | null;
  url?: string | null;
  generation?: {
    type?: string | null;
    location?: string | null;
  } | null;
}

export function hasTimelineVideoExtension(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isTimelineVideoType(type: string | null | undefined): boolean {
  if (!type) return false;
  return VIDEO_TYPES.has(type);
}

export function isTimelineVideoLike(input: Pick<TimelineEligibilityInput, 'type' | 'location' | 'imageUrl' | 'url' | 'generation'>): boolean {
  if (isTimelineVideoType(input.type)) return true;
  if (hasTimelineVideoExtension(input.location)) return true;
  if (hasTimelineVideoExtension(input.imageUrl)) return true;
  if (hasTimelineVideoExtension(input.url)) return true;
  if (isTimelineVideoType(input.generation?.type)) return true;
  if (hasTimelineVideoExtension(input.generation?.location)) return true;
  return false;
}

export function hasPositionedTimelineFrame(timelineFrame: number | null | undefined): boolean {
  return timelineFrame != null && timelineFrame >= 0;
}

export function isTimelineEligiblePositionedImage(input: TimelineEligibilityInput): boolean {
  if (!hasPositionedTimelineFrame(input.timeline_frame)) {
    return false;
  }
  return !isTimelineVideoLike(input);
}

export function filterTimelineEligiblePositionedImages<T extends TimelineEligibilityInput>(
  rows: T[],
): T[] {
  return rows.filter((row) => isTimelineEligiblePositionedImage(row));
}
