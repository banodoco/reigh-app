import { GenerationRow } from '@/domains/generation/types';

/** Shape of a shot_generations join row */
interface ShotGenerationJoinRow {
  shot_id: string;
  timeline_frame: number | null;
}

/** Raw generation data from Supabase */
interface RawGenerationData {
  id: string;
  location: string | null;
  thumbnail_url: string | null;
  type: string | null;
  created_at: string;
  params: unknown;
  starred: boolean | null;
  based_on: string | null;
  [key: string]: unknown;
}

/**
 * Build shot associations array from shot_generations relation
 */
const buildShotAssociations = (shotGenerations: ShotGenerationJoinRow[]) => {
  return shotGenerations.map((sg) => ({
    shot_id: sg.shot_id,
    timeline_frame: sg.timeline_frame,
    position: sg.timeline_frame,
  }));
};

/**
 * Transform database generation data to GenerationRow format
 */
export const transformExternalGeneration = (
  data: RawGenerationData,
  shotGenerations: ShotGenerationJoinRow[]
): GenerationRow => {
  const allAssociations = buildShotAssociations(shotGenerations);
  const params =
    typeof data.params === 'object' && data.params !== null && !Array.isArray(data.params)
      ? (data.params as Record<string, unknown>)
      : {};

  const transformedData = {
    id: data.id,
    generation_id: data.id, // For external generations, id IS the generations.id
    shotImageEntryId: data.id,
    imageUrl: data.location,
    thumbUrl: data.thumbnail_url || data.location,
    location: data.location,
    type: data.type,
    createdAt: data.created_at,
    timeline_frame: shotGenerations.length > 0 ? shotGenerations[0].timeline_frame : undefined,
    metadata: params,
    starred: data.starred ?? false,
    params,
    based_on: data.based_on,
    all_shot_associations: allAssociations,
    ...(shotGenerations.length > 0 ? {
      shot_id: shotGenerations[0].shot_id,
      position: shotGenerations[0].timeline_frame,
    } : {})
  } as GenerationRow;

  return transformedData;
};
