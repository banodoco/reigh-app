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

/**
 * Maps a raw Supabase response from shot_generations (with joined generations)
 * to the standardized GenerationRow format used throughout the app.
 *
 * IMPORTANT: This must be used by ALL hooks (useListShots, useAllShotGenerations, etc.)
 * to ensure selectors and filters work consistently across the Sidebar and Editor.
 */
export const mapShotGenerationToRow = (sg: any): GenerationRow | null => {
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

    // Legacy support:
    position: sg.timeline_frame != null ? Math.floor(sg.timeline_frame / 50) : undefined,
  } as GenerationRow;
};
