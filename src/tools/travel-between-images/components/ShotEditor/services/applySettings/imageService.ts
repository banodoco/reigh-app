import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import type { AddImageToShotVariables } from '@/shared/hooks/shots/addImageToShotHelpers';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import type { GenerationRow } from '@/domains/generation/types';
import type { Shot } from '@/domains/generation/types';
import type {
  ApplyResult,
  ExtractedGenerationSettings,
  ExtractedImageSettings,
} from './types';

/**
 * Apply frame positions from segment_frames_expanded to existing images.
 * This is used when settings are applied WITHOUT replacing images.
 */
export const applyFramePositionsToExistingImages = async (
  settings: ExtractedGenerationSettings,
  selectedShot: Shot | null,
  simpleFilteredImages: GenerationRow[],
): Promise<ApplyResult> => {
  const segmentGaps = settings.segmentFramesExpanded;
  const hasSegmentGaps = Array.isArray(segmentGaps) && segmentGaps.length > 0;

  if (!hasSegmentGaps) {
    return { success: true, settingName: 'framePositions', details: 'no data' };
  }

  if (!selectedShot?.id) {
    return { success: true, settingName: 'framePositions', details: 'skipped - no shot' };
  }

  // Calculate cumulative positions from gaps
  const cumulativePositions: number[] = [0]; // First image always at frame 0
  for (let i = 0; i < segmentGaps.length; i++) {
    const prevPosition = cumulativePositions[cumulativePositions.length - 1];
    cumulativePositions.push(prevPosition + segmentGaps[i]);
  }

  try {
    // Update timeline_frame for each image
    const updates = simpleFilteredImages.map(async (img, index) => {
      // img.id is the shot_generations.id
      if (!img.id) {
        return null;
      }

      // Use cumulative position if available
      const newTimelineFrame = index < cumulativePositions.length
        ? cumulativePositions[index]
        : cumulativePositions[cumulativePositions.length - 1] + (index - cumulativePositions.length + 1) * (segmentGaps[segmentGaps.length - 1] || 60);

      const { error } = await supabase().from('shot_generations')
        .update({ timeline_frame: newTimelineFrame })
        .eq('id', img.id); // img.id is shot_generations.id

      if (error) {
        normalizeAndPresentError(error, {
          context: 'ApplySettings.applyFramePositions',
          showToast: false,
          logData: { shotGenerationId: img.id },
        });
        return null;
      }

      return { id: img.id, newTimelineFrame };
    });

    const results = await Promise.all(updates);
    const updatedFrameCount = results.filter(r => r !== null).length;

    return {
      success: true,
      settingName: 'framePositions',
      details: { updated: updatedFrameCount, total: simpleFilteredImages.length },
    };
  } catch (e) {
    const appError = normalizeAndPresentError(e, {
      context: 'ApplySettings.applyFramePositions',
      showToast: false,
    });
    return {
      success: false,
      settingName: 'framePositions',
      error: appError.message,
    };
  }
};

export const replaceImagesIfRequested = async (
  generationSettings: ExtractedGenerationSettings,
  imageSettings: ExtractedImageSettings,
  replaceImages: boolean,
  inputImages: string[],
  selectedShot: Shot | null,
  projectId: string,
  simpleFilteredImages: GenerationRow[],
  addImageToShotMutation: { mutateAsync: (params: AddImageToShotVariables) => Promise<unknown> },
  removeImageFromShotMutation: {
    mutateAsync: (params: {
      shotId: string;
      shotGenerationId: string;
      projectId: string;
      shiftItems?: { id: string; newFrame: number }[];
    }) => Promise<unknown>;
  },
): Promise<ApplyResult> => {
  if (!replaceImages) {
    // Apply frame positions to existing images even when not replacing.
    return await applyFramePositionsToExistingImages(generationSettings, selectedShot, simpleFilteredImages);
  }

  if (!selectedShot?.id || !projectId) {
    return { success: true, settingName: 'images', details: 'skipped - missing context' };
  }

  // Use inputImages from params if passed array is empty but settings has them
  const effectiveInputImages = (inputImages && inputImages.length > 0)
    ? inputImages
    : (imageSettings.inputImages || []);

  if (effectiveInputImages.length === 0) {
    return { success: false, settingName: 'images', error: 'No input images available' };
  }

  try {
    // Remove existing non-video images (only those with id)
    const imagesToDelete = simpleFilteredImages.filter((img): img is GenerationRow & { id: string } => !!img.id);

    const deletions = imagesToDelete.map(img => removeImageFromShotMutation.mutateAsync({
      shotId: selectedShot.id,
      shotGenerationId: img.id, // img.id is shot_generations.id - narrowed by filter above
      projectId,
    }));

    if (deletions.length > 0) {
      await Promise.allSettled(deletions);
    }

    // Calculate timeline positions from segment_frames_expanded array
    // segment_frames_expanded contains gaps between successive frames.
    const segmentGaps = generationSettings.segmentFramesExpanded;
    const hasSegmentGaps = Array.isArray(segmentGaps) && segmentGaps.length > 0;

    // Calculate cumulative positions from gaps
    let cumulativePositions: number[] = [];
    if (hasSegmentGaps) {
      cumulativePositions = [0]; // First image always at frame 0
      for (let i = 0; i < segmentGaps.length; i++) {
        const prevPosition = cumulativePositions[cumulativePositions.length - 1];
        cumulativePositions.push(prevPosition + segmentGaps[i]);
      }
    }

    // Fallback to uniform spacing if no segment_frames_expanded
    const uniformSpacing = generationSettings.frames || 60;

    // Look up generation IDs for all input image URLs
    const { data: generationLookup, error: lookupError } = await supabase().from('generations')
      .select('id, location, thumbnail_url')
      .in('location', effectiveInputImages);

    if (lookupError) {
      normalizeAndPresentError(lookupError, {
        context: 'ApplySettings.replaceImages',
        showToast: false,
        logData: { imageCount: effectiveInputImages.length },
      });
      return { success: false, settingName: 'images', error: 'Failed to look up generation IDs for input images' };
    }

    // Create a map of URL -> generation data for quick lookup
    const urlToGeneration = new Map<string, { id: string; location: string; thumbnail_url: string | null }>();
    (generationLookup || []).forEach(gen => {
      if (typeof gen.location === 'string' && gen.location.length > 0) {
        urlToGeneration.set(gen.location, {
          id: gen.id,
          location: gen.location,
          thumbnail_url: gen.thumbnail_url,
        });
      }
    });

    // Add input images in order with calculated timeline_frame positions
    const additions = effectiveInputImages.map((url, index) => {
      // Use cumulative position if available, otherwise fall back to uniform spacing.
      const timelineFrame = hasSegmentGaps && index < cumulativePositions.length
        ? cumulativePositions[index]
        : index * uniformSpacing;

      const generation = urlToGeneration.get(url);

      if (!generation) {
        return Promise.resolve(); // Skip this image
      }

      return addImageToShotMutation.mutateAsync({
        shot_id: selectedShot.id,
        generation_id: generation.id,
        project_id: projectId,
        imageUrl: url,
        thumbUrl: generation.thumbnail_url || url,
        timelineFrame,
      });
    });

    if (additions.length > 0) {
      await Promise.allSettled(additions);
    }

    return {
      success: true,
      settingName: 'images',
      details: { removed: imagesToDelete.length, added: effectiveInputImages.length },
    };
  } catch (e) {
    const appError = normalizeAndPresentError(e, {
      context: 'ApplySettings.replaceImages',
      showToast: false,
    });
    return {
      success: false,
      settingName: 'images',
      error: appError.message,
    };
  }
};
