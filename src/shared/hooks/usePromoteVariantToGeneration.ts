/**
 * usePromoteVariantToGeneration Hook
 *
 * Creates a new generation record from an existing variant.
 * This allows variants to be promoted to standalone generations that can
 * be added to shots, starred, and treated as first-class gallery items.
 *
 * Used by:
 * - VariantSelector "Make new image" button
 * - ShotSelectorControls "Add as new image to shot" button
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { hasVideoExtension } from '@/shared/lib/typeGuards';
import { handleError } from '@/shared/lib/errorHandler';
import { queryKeys } from '@/shared/lib/queryKeys';

interface PromoteVariantParams {
  /** ID of the variant to promote */
  variantId: string;
  /** Project ID for the new generation */
  projectId: string;
}

interface PromotedGeneration {
  id: string;
  location: string;
  thumbnail_url: string | null;
  type: string;
  project_id: string;
  based_on: string;
  params: Record<string, unknown>;
}

/**
 * Hook for promoting a variant to a standalone generation
 */
export const usePromoteVariantToGeneration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      variantId,
      projectId,
    }: PromoteVariantParams): Promise<PromotedGeneration> => {
      // 1. Fetch the variant — its generation_id is the single source of truth for lineage
      const { data: variant, error: variantError } = await supabase
        .from('generation_variants')
        .select('*')
        .eq('id', variantId)
        .single();

      if (variantError || !variant) {
        throw new Error(`Failed to fetch variant: ${variantError?.message || 'Not found'}`);
      }

      const sourceGenerationId = variant.generation_id;

      // 2. Determine if this is a video or image based on the URL
      const isVideo = hasVideoExtension(variant.location);
      const mediaType = isVideo ? 'video' : 'image';

      // 3. Create new generation record
      // Strip generation_id from variant params — if it leaks into the new generation's params,
      // generationTransformers spreads params into metadata, and getGenerationId() reads
      // metadata.generation_id (priority 2) over media.id (priority 3), causing the lightbox
      // to fetch variants for the SOURCE generation instead of the new one.
      const {
        generation_id: _stripGenId,
        source_task_id: _stripTaskId,
        ...cleanVariantParams
      } = (variant.params as Record<string, unknown>) || {};

      const newGenerationData = {
        location: variant.location,
        thumbnail_url: variant.thumbnail_url,
        project_id: projectId,
        type: mediaType,
        based_on: sourceGenerationId,
        params: {
          ...cleanVariantParams,
          source: 'variant_promotion',
          source_variant_id: variantId,
          source_generation_id: sourceGenerationId,
          tool_type: cleanVariantParams.tool_type || 'promoted-variant',
          promoted_at: new Date().toISOString(),
        },
      };

      const { data: newGeneration, error: insertError } = await supabase
        .from('generations')
        .insert(newGenerationData)
        .select()
        .single();

      if (insertError || !newGeneration) {
        throw new Error(`Failed to create generation: ${insertError?.message || 'Unknown error'}`);
      }

      // DB trigger trg_auto_create_variant_after_generation auto-creates
      // the primary variant from the generation's location/params.

      return {
        id: newGeneration.id,
        location: newGeneration.location,
        thumbnail_url: newGeneration.thumbnail_url,
        type: newGeneration.type,
        project_id: newGeneration.project_id,
        based_on: newGeneration.based_on,
        params: newGeneration.params as Record<string, unknown>,
      };
    },

    onSuccess: (data) => {
      // Invalidate generations queries to show the new generation in galleries
      queryClient.invalidateQueries({ queryKey: queryKeys.generations.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.generations.byProjectAll });

      // Invalidate derived generations for the source
      if (data.based_on) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.generations.derivedGenerations(data.based_on),
        });
      }
    },

    onError: (error) => {
      handleError(error, { context: 'usePromoteVariantToGeneration', toastTitle: 'Failed to create new image from variant' });
    },
  });
};

// NOTE: Default export removed - use named export { usePromoteVariantToGeneration } instead
