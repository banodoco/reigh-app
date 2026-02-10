/**
 * useLoadVariantImages Hook
 *
 * Loads a variant's source images onto the timeline by switching primary variants.
 * For each image position (start, end) where the image differs:
 * - Same generation, different variant → find and set as primary
 * - Same generation, match by URL → find and set as primary
 * - Different generation entirely → create new variant with source URL, set as primary
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { invalidateVariantChange } from '@/shared/hooks/useGenerationInvalidation';
import { handleError } from '@/shared/lib/errorHandler';
import type { GenerationVariant } from '@/shared/hooks/useVariants';
import type { CurrentSegmentImagesData } from '@/shared/components/VariantSelector/utils';

interface UseLoadVariantImagesProps {
  currentSegmentImages?: CurrentSegmentImagesData & {
    startShotGenerationId?: string;
    endShotGenerationId?: string;
  };
}

/**
 * Extract the storage path from a full URL or relative path for matching.
 */
function extractStoragePath(url: string | undefined | null): string | null {
  if (!url) return null;
  const storageMatch = url.match(/\/storage\/v1\/object\/(?:public|sign)\/(.+?)(?:\?|$)/);
  if (storageMatch) return storageMatch[1];
  if (url.startsWith('generations/') || url.startsWith('/generations/')) {
    return url.replace(/^\//, '');
  }
  return url;
}

function pathsMatch(url1: string | undefined | null, url2: string | undefined | null): boolean {
  if (!url1 || !url2) return false;
  if (url1 === url2) return true;
  const p1 = extractStoragePath(url1);
  const p2 = extractStoragePath(url2);
  return !!p1 && !!p2 && p1 === p2;
}

export function useLoadVariantImages({ currentSegmentImages }: UseLoadVariantImagesProps) {
  const queryClient = useQueryClient();

  const loadVariantImages = useCallback(async (variant: GenerationVariant) => {
    if (!currentSegmentImages) return;

    const params = variant.params;
    if (!params) return;

    // Extract source image data from variant params
    const indivParams = (params.individual_segment_params || {}) as Record<string, unknown>;
    const resolvedPaths = (indivParams.input_image_paths_resolved || params.input_image_paths_resolved) as string[] | undefined;

    const variantStartGenId = (indivParams.start_image_generation_id || params.start_image_generation_id) as string | undefined;
    const variantEndGenId = (indivParams.end_image_generation_id || params.end_image_generation_id) as string | undefined;
    const variantStartVariantId = (indivParams.start_image_variant_id || params.start_image_variant_id) as string | undefined;
    const variantEndVariantId = (indivParams.end_image_variant_id || params.end_image_variant_id) as string | undefined;
    const variantStartUrl = resolvedPaths?.[0] || (indivParams.start_image_url || params.start_image_url) as string | undefined;
    const variantEndUrl = resolvedPaths && resolvedPaths.length > 1
      ? resolvedPaths[resolvedPaths.length - 1]
      : (indivParams.end_image_url || params.end_image_url) as string | undefined;

    // Process each image position
    const positions = [
      {
        variantGenId: variantStartGenId,
        variantVariantId: variantStartVariantId,
        variantUrl: variantStartUrl,
        currentGenId: currentSegmentImages.startGenerationId,
        currentVariantId: currentSegmentImages.startVariantId,
        currentUrl: currentSegmentImages.startUrl,
      },
      {
        variantGenId: variantEndGenId,
        variantVariantId: variantEndVariantId,
        variantUrl: variantEndUrl,
        currentGenId: currentSegmentImages.endGenerationId,
        currentVariantId: currentSegmentImages.endVariantId,
        currentUrl: currentSegmentImages.endUrl,
      },
    ];

    for (const pos of positions) {
      // Skip if no source data or no current data
      if (!pos.variantGenId && !pos.variantUrl) continue;
      if (!pos.currentGenId) continue;

      try {
        await loadSingleImage({
          variantGenId: pos.variantGenId,
          variantVariantId: pos.variantVariantId,
          variantUrl: pos.variantUrl,
          currentGenId: pos.currentGenId,
          currentVariantId: pos.currentVariantId,
          currentUrl: pos.currentUrl,
        });

        // Invalidate caches for this generation
        await invalidateVariantChange(queryClient, {
          generationId: pos.currentGenId,
          reason: 'load-variant-images',
        });
      } catch (error) {
        handleError(error, { context: 'LoadVariantImages', showToast: false });
      }
    }
  }, [currentSegmentImages, queryClient]);

  return { loadVariantImages };
}

/**
 * Load a single image position: find or create the variant and make it primary.
 */
async function loadSingleImage(pos: {
  variantGenId: string | undefined;
  variantVariantId: string | undefined;
  variantUrl: string | undefined;
  currentGenId: string;
  currentVariantId: string | undefined;
  currentUrl: string | undefined;
}) {
  // Check if images actually differ
  if (pos.variantGenId === pos.currentGenId) {
    if (pos.variantVariantId && pos.currentVariantId && pos.variantVariantId === pos.currentVariantId) {
      return; // Same variant, nothing to do
    }
    if (!pos.variantVariantId && !pos.currentVariantId) {
      if (pathsMatch(pos.variantUrl, pos.currentUrl)) return;
    }
  }

  const targetGenerationId = pos.currentGenId;

  // Strategy 1: Same generation - find variant by ID
  if (pos.variantGenId === pos.currentGenId && pos.variantVariantId) {
    await setPrimaryById(pos.variantVariantId);
    return;
  }

  // Strategy 2: Find variant by URL match on the current generation
  if (pos.variantUrl) {
    const { data: existingVariants } = await supabase
      .from('generation_variants')
      .select('id, location')
      .eq('generation_id', targetGenerationId);

    if (existingVariants) {
      const match = existingVariants.find(v => pathsMatch(v.location, pos.variantUrl));
      if (match) {
        await setPrimaryById(match.id);
        return;
      }
    }

    // Strategy 3: Create new variant with the source URL
    const { data: newVariant, error } = await supabase
      .from('generation_variants')
      .insert({
        generation_id: targetGenerationId,
        location: pos.variantUrl,
        thumbnail_url: pos.variantUrl,
        is_primary: true, // DB trigger handles unsetting old primary
        variant_type: 'loaded',
        params: {
          source_generation_id: pos.variantGenId,
          loaded_from_variant: pos.variantVariantId,
          source_url: pos.variantUrl,
        },
      })
      .select('id')
      .single();

    if (error) {
      throw new Error(`Failed to create variant: ${error.message}`);
    }
  }
}

/**
 * Set a variant as primary by ID. DB trigger handles unsetting the old primary.
 */
async function setPrimaryById(variantId: string) {
  const { error } = await supabase
    .from('generation_variants')
    .update({ is_primary: true })
    .eq('id', variantId);

  if (error) {
    throw new Error(`Failed to set primary variant: ${error.message}`);
  }
}
