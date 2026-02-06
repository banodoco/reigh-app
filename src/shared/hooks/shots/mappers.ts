/**
 * Data mappers for shot-related data transformations.
 * These ensure consistent data shapes across all hooks.
 */

import { GenerationRow } from '@/types/shots';

/**
 * Row type for shot_generations table entries.
 */
export interface ShotGenerationRow {
  id: string;
  generation_id: string;
  timeline_frame: number;
}

/** Shape of the joined generation data from Supabase shot_generations query */
interface JoinedGeneration {
  id: string;
  location: string | null;
  thumbnail_url: string | null;
  type: string | null;
  created_at: string;
  starred: boolean | null;
  name: string | null;
  based_on: string | null;
  params: Record<string, unknown> | null;
  primary_variant_id?: string | null;
  primary_variant?: {
    location: string | null;
    thumbnail_url: string | null;
  } | null;
}

/** Shape of a raw Supabase shot_generations row with joined generation data */
interface RawShotGeneration {
  id: string;
  generation_id?: string;
  timeline_frame: number | null;
  metadata: Record<string, unknown> | null;
  generations?: JoinedGeneration | null;
  generation?: JoinedGeneration | null;
}

/**
 * Maps a raw Supabase response from shot_generations (with joined generations)
 * to the standardized GenerationRow format used throughout the app.
 *
 * IMPORTANT: This must be used by ALL hooks (useListShots, useShotImages, etc.)
 * to ensure selectors and filters work consistently across the Sidebar and Editor.
 */
export const mapShotGenerationToRow = (sg: RawShotGeneration): GenerationRow | null => {
  const gen = sg.generations || sg.generation; // Handle both aliases
  if (!gen) return null;

  // CRITICAL: Use primary variant's location/thumbnail if available
  // Falls back to generation.location if no primary variant exists (legacy data)
  const primaryVariant = gen.primary_variant;
  const effectiveLocation = primaryVariant?.location || gen.location;
  const effectiveThumbnail = primaryVariant?.thumbnail_url || gen.thumbnail_url || effectiveLocation;

  return {
    // PRIMARY ID FIELDS:
    id: sg.id, // shot_generations.id - unique per entry in shot
    generation_id: gen.id, // generations.id - the actual generation

    // DEPRECATED (kept for backwards compat during transition):
    shotImageEntryId: sg.id,
    shot_generation_id: sg.id,

    // Generation data - uses primary variant URLs for display/submission
    location: effectiveLocation,
    imageUrl: effectiveLocation,
    thumbUrl: effectiveThumbnail,
    type: gen.type || 'image',
    created_at: gen.created_at,
    createdAt: gen.created_at,
    starred: gen.starred || false,
    name: gen.name,
    based_on: gen.based_on,
    params: gen.params || {},

    // From shot_generations table:
    timeline_frame: sg.timeline_frame,
    metadata: sg.metadata || {},
    primary_variant_id: gen.primary_variant_id || null,

    // Legacy support:
    position: sg.timeline_frame != null ? Math.floor(sg.timeline_frame / 50) : undefined,
  } as GenerationRow;
};
