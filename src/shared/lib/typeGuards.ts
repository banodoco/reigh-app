/** Shared type guards for generation/video records. */

import { GenerationRow } from '@/domains/generation/types';

/** Minimal interface for nested shot_generation records (plural `.generations`). */
export interface ShotGenerationsLike {
  generations?: {
    type?: string;
    location?: string;
  } | null;
  timeline_frame?: number | null;
}

interface PositionedItem {
  timeline_frame?: number | null;
}

const VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov'] as const;

export function hasVideoExtension(url: string | null | undefined): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return VIDEO_EXTENSIONS.some(ext => lower.endsWith(ext));
}

export function isVideoGeneration(gen: GenerationRow): boolean {
  return (
    gen.type === 'video' ||
    gen.type === 'video_travel_output' ||
    hasVideoExtension(gen.location) ||
    hasVideoExtension(gen.imageUrl)
  );
}

export function isVideoShotGenerations(sg: ShotGenerationsLike): boolean {
  if (!sg.generations) return false;
  return (
    sg.generations.type === 'video' ||
    sg.generations.type === 'video_travel_output' ||
    hasVideoExtension(sg.generations.location)
  );
}

export function isVideoAny(item: {
  type?: string | null;
  location?: string | null;
  imageUrl?: string | null;
  url?: string | null; // Some components use .url instead of .imageUrl
  thumbUrl?: string | null;
  generation?: { type?: string; location?: string } | null;
  generations?: { type?: string; location?: string } | null;
}): boolean {
  if (item.type === 'video' || item.type === 'video_travel_output') return true;
  if (hasVideoExtension(item.location)) return true;
  if (hasVideoExtension(item.imageUrl)) return true;
  if (hasVideoExtension(item.url)) return true;
  if (hasVideoExtension(item.thumbUrl)) return true;
  if (item.generation?.type === 'video' || item.generation?.type === 'video_travel_output') return true;
  if (hasVideoExtension(item.generation?.location)) return true;
  if (item.generations?.type === 'video' || item.generations?.type === 'video_travel_output') return true;
  if (hasVideoExtension(item.generations?.location)) return true;
  return false;
}

export function isPositioned(item: PositionedItem): boolean {
  return item.timeline_frame != null && item.timeline_frame !== -1;
}

