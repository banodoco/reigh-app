import { GenerationRow } from '@/domains/generation/types';

interface ShotGenerationRow {
  id: string;
  generation_id: string;
  timeline_frame: number;
}

interface JoinedGeneration {
  id: string;
  location: string | null;
  thumbnail_url: string | null;
  type: string | null;
  created_at: string;
  starred: boolean | null;
  name: string | null;
  based_on: string | null;
  params: unknown;
  primary_variant_id?: string | null;
  primary_variant?: {
    location: string | null;
    thumbnail_url: string | null;
  } | null;
}

interface RawShotGeneration {
  id: string;
  shot_id?: string;
  generation_id?: string;
  timeline_frame: number | null;
  metadata?: unknown;
  generations?: JoinedGeneration | null;
  generation?: JoinedGeneration | null;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
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
    id: sg.id, // shot_generations.id (unique per entry in shot)
    generation_id: gen.id, // generations.id (the actual generation)

    // Deprecated aliases (kept for backwards compat during transition)
    shotImageEntryId: sg.id,
    shot_generation_id: sg.id,

    location: effectiveLocation,
    imageUrl: effectiveLocation,
    thumbUrl: effectiveThumbnail,
    type: gen.type || 'image',
    created_at: gen.created_at,
    createdAt: gen.created_at,
    starred: gen.starred || false,
    name: gen.name,
    based_on: gen.based_on,
    params: toRecord(gen.params),

    timeline_frame: sg.timeline_frame,
    metadata: toRecord(sg.metadata),
    primary_variant_id: gen.primary_variant_id || null,

    position: sg.timeline_frame != null ? Math.floor(sg.timeline_frame / 50) : undefined,
  } as GenerationRow;
};
