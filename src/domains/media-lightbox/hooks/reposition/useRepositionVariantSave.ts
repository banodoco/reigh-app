import { useState, useCallback } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { useQueryClient } from '@tanstack/react-query';
import { uploadImageToStorage } from '@/shared/lib/media/imageUploader';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { enqueueVariantInvalidation } from '@/shared/hooks/invalidation/useGenerationInvalidation';
import type { ImageTransform } from './types';
import type { GenerationRow } from '@/domains/generation/types';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { VARIANT_TYPE } from '@/shared/constants/variantTypes';
import { TOOL_IDS } from '@/shared/lib/toolIds';
import { toJson } from '@/shared/lib/supabaseTypeHelpers';

/** Extended media fields that may be present at runtime from gallery/query layer */
interface MediaWithShotFields {
  shot_id?: string;
  all_shot_associations?: Array<{ shot_id: string; position: number | null }>;
}

interface UseRepositionVariantSaveProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  shotId?: string;
  toolTypeOverride?: string;
  imageDimensions: { width: number; height: number } | null;
  transform: ImageTransform;
  hasTransformChanges: boolean;
  createAsGeneration?: boolean;
  activeVariantId?: string | null;
  onVariantCreated?: (variantId: string) => void;
  refetchVariants?: () => void;
  resetTransform: () => void;
  /** Function to create the transformed canvas */
  createTransformedCanvas: () => Promise<HTMLCanvasElement>;
  /** Get current cache key for clearing */
  getCacheKey: () => string;
  /** Clear cache for a specific key */
  clearCacheForKey: (key: string) => void;
  /** Mark that next cache should be skipped */
  markSkipNextCache: () => void;
}

interface UseRepositionVariantSaveReturn {
  isSavingAsVariant: boolean;
  saveAsVariantSuccess: boolean;
  handleSaveAsVariant: () => Promise<void>;
}

/**
 * Hook for saving transformed images as variants or new generations.
 * Handles thumbnail generation, upload, DB insertion, and cache invalidation.
 */
export function useRepositionVariantSave({
  media,
  selectedProjectId,
  shotId,
  toolTypeOverride,
  imageDimensions,
  transform,
  hasTransformChanges,
  createAsGeneration,
  activeVariantId,
  onVariantCreated,
  refetchVariants,
  resetTransform,
  createTransformedCanvas,
  getCacheKey,
  clearCacheForKey,
  markSkipNextCache,
}: UseRepositionVariantSaveProps): UseRepositionVariantSaveReturn {
  const queryClient = useQueryClient();
  const [isSavingAsVariant, setIsSavingAsVariant] = useState(false);
  const [saveAsVariantSuccess, setSaveAsVariantSuccess] = useState(false);

  // Save transformed image as a variant (without AI generation)
  const handleSaveAsVariant = useCallback(async () => {
    if (!selectedProjectId || !imageDimensions) {
      toast.error('Missing project or image dimensions');
      return;
    }

    if (!hasTransformChanges) {
      toast.error('Please make some changes first');
      return;
    }

    setIsSavingAsVariant(true);

    try {

      const transformedCanvas = await createTransformedCanvas();

      // Create a new canvas with black background, then draw transformed image on top
      const outputCanvas = document.createElement('canvas');
      outputCanvas.width = transformedCanvas.width;
      outputCanvas.height = transformedCanvas.height;
      const outputCtx = outputCanvas.getContext('2d');

      if (outputCtx) {
        // Fill with black first
        outputCtx.fillStyle = '#000000';
        outputCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
        // Draw the transformed image (with transparency) on top
        outputCtx.drawImage(transformedCanvas, 0, 0);
      }

      // Convert canvas to blob for main image (use outputCanvas which has black background)
      const transformedBlob = await new Promise<Blob>((resolve, reject) => {
        outputCanvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create transformed image blob'));
        }, 'image/png');
      });

      // Generate thumbnail (max 300px)
      const thumbnailMaxSize = 300;
      const aspectRatio = outputCanvas.width / outputCanvas.height;
      let thumbWidth: number, thumbHeight: number;

      if (aspectRatio > 1) {
        thumbWidth = Math.min(outputCanvas.width, thumbnailMaxSize);
        thumbHeight = Math.round(thumbWidth / aspectRatio);
      } else {
        thumbHeight = Math.min(outputCanvas.height, thumbnailMaxSize);
        thumbWidth = Math.round(thumbHeight * aspectRatio);
      }

      const thumbnailCanvas = document.createElement('canvas');
      thumbnailCanvas.width = thumbWidth;
      thumbnailCanvas.height = thumbHeight;
      const thumbCtx = thumbnailCanvas.getContext('2d');

      if (thumbCtx) {
        thumbCtx.drawImage(outputCanvas, 0, 0, thumbWidth, thumbHeight);
      }

      // Convert thumbnail to blob
      const thumbnailBlob = await new Promise<Blob>((resolve, reject) => {
        thumbnailCanvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create thumbnail blob'));
        }, 'image/jpeg', 0.8);
      });

      // Upload both images
      const transformedFile = new File(
        [transformedBlob],
        `repositioned_${media.id}_${Date.now()}.png`,
        { type: 'image/png' }
      );
      const thumbnailFile = new File(
        [thumbnailBlob],
        `repositioned_thumb_${media.id}_${Date.now()}.jpg`,
        { type: 'image/jpeg' }
      );

      const [transformedUrl, thumbnailUrl] = await Promise.all([
        uploadImageToStorage(transformedFile),
        uploadImageToStorage(thumbnailFile)
      ]);

      // Get the actual generation ID
      const actualGenerationId = getGenerationId(media);

      if (createAsGeneration) {
        // Create a new generation with based_on pointing to the source
        const generationParams = toJson({
          // Note: transform is baked into the image, we only save it for historical reference
          transform_applied: transform,
          saved_at: new Date().toISOString(),
          tool_type: toolTypeOverride || TOOL_IDS.EDIT_IMAGES,
          repositioned_from: actualGenerationId,
          ...(activeVariantId ? { source_variant_id: activeVariantId } : {}),
        });

        const { data: insertedGeneration, error: genError } = await supabase().from('generations')
          .insert({
            project_id: selectedProjectId,
            location: transformedUrl,
            thumbnail_url: thumbnailUrl,
            type: 'image',
            based_on: actualGenerationId, // Track lineage
            params: generationParams
          })
          .select('id')
          .single();

        if (genError) {
          console.error('[Reposition] Failed to create generation:', genError);
          throw genError;
        }

        // Create the original variant
        await supabase().from('generation_variants').insert({
          generation_id: insertedGeneration.id,
          location: transformedUrl,
          thumbnail_url: thumbnailUrl,
          is_primary: true,
          variant_type: VARIANT_TYPE.ORIGINAL,
          name: 'Original',
          params: generationParams,
        });

        // Clear the transform cache for the current variant (we don't want to restore the editing transform)
        const currentCacheKey = getCacheKey();
        if (currentCacheKey) {
          clearCacheForKey(currentCacheKey);
        }
        // Skip caching when the useEffect runs
        markSkipNextCache();
      } else {
        // Create a new variant and make it primary (displayed by default)
        const { data: insertedVariant, error: insertError } = await supabase().from('generation_variants')
          .insert({
            generation_id: actualGenerationId ?? media.id,
            location: transformedUrl,
            thumbnail_url: thumbnailUrl,
            is_primary: true,
            variant_type: 'repositioned',
            name: 'Repositioned',
            params: toJson({
              // Note: transform is baked into the image, we only save it for historical reference
              transform_applied: transform,
              saved_at: new Date().toISOString(),
              tool_type: toolTypeOverride || TOOL_IDS.EDIT_IMAGES,
              ...(activeVariantId ? { source_variant_id: activeVariantId } : {}),
            })
          })
          .select('id')
          .single();

        if (insertError) {
          console.error('[Reposition] Failed to create variant:', insertError);
          throw insertError;
        }

        // Clear the transform cache and skip re-caching on variant switch
        const currentCacheKey = getCacheKey();
        if (currentCacheKey) {
          clearCacheForKey(currentCacheKey);
        }
        if (insertedVariant?.id) {
          clearCacheForKey(insertedVariant.id);
        }
        // Skip caching when the useEffect runs due to variant change
        markSkipNextCache();

        // Switch to the newly created variant (only for variant mode)
        if (insertedVariant?.id && onVariantCreated) {
          onVariantCreated(insertedVariant.id);
        }
      }

      setIsSavingAsVariant(false);
      setSaveAsVariantSuccess(true);

      setTimeout(() => {
        setSaveAsVariantSuccess(false);
        resetTransform();
      }, 1000);

      // Cache invalidation after UI feedback
      const mediaExt = media as GenerationRow & MediaWithShotFields;
      const effectiveShotId = shotId || mediaExt.shot_id ||
        (mediaExt.all_shot_associations?.[0]?.shot_id);

      await enqueueVariantInvalidation(queryClient, {
        generationId: actualGenerationId ?? media.id,
        shotId: effectiveShotId,
        reason: 'reposition-variant-created',
        delayMs: 100,
      });

      if (refetchVariants) {
        refetchVariants();
      }
    } catch (error) {
      normalizeAndPresentError(error, { context: 'useRepositionVariantSave', toastTitle: 'Failed to save as variant' });
    } finally {
      setIsSavingAsVariant(false);
    }
  }, [
    selectedProjectId,
    imageDimensions,
    hasTransformChanges,
    media,
    transform,
    resetTransform,
    createTransformedCanvas,
    onVariantCreated,
    refetchVariants,
    createAsGeneration,
    toolTypeOverride,
    shotId,
    queryClient,
    getCacheKey,
    clearCacheForKey,
    markSkipNextCache,
    activeVariantId,
  ]);

  return {
    isSavingAsVariant,
    saveAsVariantSuccess,
    handleSaveAsVariant,
  };
}
