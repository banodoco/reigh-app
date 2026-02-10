/**
 * Shot query hooks for fetching shot data.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { GenerationRow } from '@/types/shots';
import { mapShotGenerationToRow } from './mappers';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';
import { queryKeys } from '@/shared/lib/queryKeys';

// ============================================================================
// LIST SHOTS
// ============================================================================

/**
 * List all shots for a specific project with configurable image loading.
 * @param projectId - The project to fetch shots for
 * @param options.maxImagesPerShot - Limit images per shot (0 = unlimited, default)
 */
export const useListShots = (
  projectId?: string | null,
  options: { maxImagesPerShot?: number } = {}
) => {
  const { maxImagesPerShot = 0 } = options;

  return useQuery({
    queryKey: projectId ? queryKeys.shots.list(projectId, maxImagesPerShot) : ['shots', projectId, maxImagesPerShot],
    queryFn: async () => {
      if (!projectId) {
        return [];
      }

      // Get shots ordered by position
      const { data: shots, error: shotsError } = await supabase
        .from('shots')
        .select('*')
        .eq('project_id', projectId)
        .order('position', { ascending: true });

      if (shotsError) {
        throw shotsError;
      }

      if (!shots || shots.length === 0) {
        return [];
      }

      // Fetch images for each shot in batches
      const BATCH_SIZE = 10;
      const imagesPerShot: { shotId: string; images: GenerationRow[] }[] = [];

      for (let i = 0; i < shots.length; i += BATCH_SIZE) {
        const batch = shots.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (shot) => {
            let query = supabase
              .from('shot_generations')
              .select(`
                id,
                shot_id,
                timeline_frame,
                generation_id,
                generation:generations!shot_generations_generation_id_generations_id_fk (
                  id,
                  location,
                  thumbnail_url,
                  type,
                  created_at,
                  starred,
                  name,
                  based_on,
                  params,
                  primary_variant_id,
                  primary_variant:generation_variants!generations_primary_variant_id_fkey (
                    location,
                    thumbnail_url
                  )
                )
              `)
              .eq('shot_id', shot.id)
              .order('timeline_frame', { ascending: true, nullsFirst: false });

            if (maxImagesPerShot > 0) {
              query = query.limit(maxImagesPerShot);
            }

            const { data: shotGenerations, error: sgError } = await query;

            if (sgError) {
              console.error(`Error fetching generations for shot ${shot.id}:`, sgError);
              return { shotId: shot.id, images: [] };
            }

            const images: GenerationRow[] = (shotGenerations || [])
              .map(mapShotGenerationToRow)
              .filter(Boolean) as GenerationRow[];

            return { shotId: shot.id, images };
          })
        );
        imagesPerShot.push(...batchResults);
      }

      // Build lookup map
      const imagesByShot: Record<string, GenerationRow[]> = {};
      imagesPerShot.forEach(({ shotId, images }) => {
        imagesByShot[shotId] = images;
      });

      // Attach images to shots with pre-computed stats
      return shots.map(shot => {
        const images = imagesByShot[shot.id] || [];

        // Count UNIQUE generation_ids
        const uniqueGenIds = new Set<string>();
        const unpositionedGenIds = new Set<string>();
        const positionedGenIds = new Set<string>();

        images.forEach(img => {
          const genId = getGenerationId(img);
          uniqueGenIds.add(genId);
          if (img.timeline_frame == null) {
            unpositionedGenIds.add(genId);
          } else {
            positionedGenIds.add(genId);
          }
        });

        const unpositionedCount = unpositionedGenIds.size;

        return {
          ...shot,
          images,
          imageCount: uniqueGenIds.size,
          positionedImageCount: positionedGenIds.size,
          unpositionedImageCount: unpositionedCount,
          hasUnpositionedImages: unpositionedCount > 0,
        };
      });
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5, // 5 minutes
    placeholderData: (previousData) => previousData,
  });
};

// ============================================================================
// PROJECT IMAGE STATS
// ============================================================================

/**
 * Fetch project-wide image stats (total images, images without shots).
 */
export const useProjectImageStats = (projectId?: string | null) => {
  return useQuery({
    queryKey: queryKeys.projectStats.images(projectId),
    queryFn: async () => {
      if (!projectId) return { allCount: 0, noShotCount: 0 };

      // Get total unique generations in project
      const { count: allCount, error: allErr } = await supabase
        .from('generations')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .not('location', 'is', null);

      if (allErr) throw allErr;

      // Get count of generations without ANY shot
      const { count: noShotCount, error: noShotErr } = await supabase
        .from('generations')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .not('location', 'is', null)
        .or('shot_data.is.null,shot_data.eq.{}');

      if (noShotErr) throw noShotErr;

      return {
        allCount: allCount || 0,
        noShotCount: noShotCount || 0,
      };
    },
    enabled: !!projectId,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
};
