import { useState, useCallback } from 'react';
import { toast } from '@/shared/components/ui/sonner';
import { handleError } from '@/shared/lib/errorHandler';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import { createImageInpaintTask } from '@/shared/lib/tasks/imageInpaint';
import { generateMaskFromCanvas, createCanvasWithBackground } from '@/shared/lib/maskGeneration';
import type { ImageTransform } from './types';
import type { GenerationRow } from '@/types/shots';
import type { EditAdvancedSettings, QwenEditModel } from '../useGenerationEditSettings';
import { convertToHiresFixApiParams } from '../useGenerationEditSettings';
import { getGenerationId } from '@/shared/lib/mediaTypeHelpers';

export interface UseRepositionTaskCreationProps {
  media: GenerationRow;
  selectedProjectId: string | null;
  shotId?: string;
  toolTypeOverride?: string;
  imageDimensions: { width: number; height: number } | null;
  loras?: Array<{ url: string; strength: number }>;
  inpaintPrompt: string;
  inpaintNumGenerations: number;
  transform: ImageTransform;
  hasTransformChanges: boolean;
  createAsGeneration?: boolean;
  advancedSettings?: EditAdvancedSettings;
  activeVariantId?: string | null;
  qwenEditModel?: QwenEditModel;
  /** Function to create the transformed canvas */
  createTransformedCanvas: () => Promise<HTMLCanvasElement>;
}

export interface UseRepositionTaskCreationReturn {
  isGeneratingReposition: boolean;
  repositionGenerateSuccess: boolean;
  handleGenerateReposition: () => Promise<void>;
}

/**
 * Hook for generating inpaint tasks from repositioned images.
 * Creates transformed image with mask for the dead space and submits to inpaint API.
 */
export function useRepositionTaskCreation({
  media,
  selectedProjectId,
  shotId,
  toolTypeOverride,
  imageDimensions,
  loras,
  inpaintPrompt,
  inpaintNumGenerations,
  transform,
  hasTransformChanges,
  createAsGeneration,
  advancedSettings,
  activeVariantId,
  qwenEditModel,
  createTransformedCanvas,
}: UseRepositionTaskCreationProps): UseRepositionTaskCreationReturn {
  const [isGeneratingReposition, setIsGeneratingReposition] = useState(false);
  const [repositionGenerateSuccess, setRepositionGenerateSuccess] = useState(false);

  // Generate transformed image and mask, then create inpaint task
  const handleGenerateReposition = useCallback(async () => {
    if (!selectedProjectId || !imageDimensions) {
      toast.error('Missing project or image dimensions');
      return;
    }

    if (!hasTransformChanges) {
      toast.error('Please move, scale, or rotate the image first');
      return;
    }

    setIsGeneratingReposition(true);

    try {
      console.log('[Reposition] Starting reposition generation...', {
        mediaId: media.id,
        prompt: inpaintPrompt,
        numGenerations: inpaintNumGenerations,
        transform
      });

      const transformedCanvas = await createTransformedCanvas();
      const outputWidth = transformedCanvas.width;
      const outputHeight = transformedCanvas.height;

      // Generate mask from the transparent areas of the transformed image
      const maskCanvas = generateMaskFromCanvas(transformedCanvas, {
        alphaThreshold: 200,
        dilationPixels: 3,
      });

      console.log('[Reposition] Generated transformed image and mask with dilated edges (alpha threshold: 200, dilation: 3px)');

      // Create final image with green background to prevent anti-aliased edge artifacts
      // The transparent canvas is needed for mask generation (alpha channel), but for the
      // uploaded image we need a solid background so edge pixels blend properly
      const finalImageCanvas = createCanvasWithBackground(transformedCanvas, '#00FF00');

      // Convert canvases to blobs and upload
      const transformedBlob = await new Promise<Blob>((resolve, reject) => {
        finalImageCanvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create transformed image blob'));
        }, 'image/png');
      });

      const maskBlob = await new Promise<Blob>((resolve, reject) => {
        maskCanvas.toBlob(blob => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to create mask blob'));
        }, 'image/png');
      });

      // Upload transformed image and mask
      const transformedFile = new File(
        [transformedBlob],
        `reposition_image_${media.id}_${Date.now()}.png`,
        { type: 'image/png' }
      );
      const maskFile = new File(
        [maskBlob],
        `reposition_mask_${media.id}_${Date.now()}.png`,
        { type: 'image/png' }
      );

      const [transformedUrl, maskUrl] = await Promise.all([
        uploadImageToStorage(transformedFile),
        uploadImageToStorage(maskFile)
      ]);

      console.log('[Reposition] Uploaded transformed image:', transformedUrl);
      console.log('[Reposition] Uploaded mask:', maskUrl);

      // Create inpaint task with transformed image and mask
      const actualGenerationId = getGenerationId(media);

      // Use a default prompt if none provided - describe filling in the edges
      const effectivePrompt = inpaintPrompt.trim() || 'seamlessly extend and fill the edges matching the existing image style and content';

      await createImageInpaintTask({
        project_id: selectedProjectId,
        image_url: transformedUrl, // Use the transformed image as base
        mask_url: maskUrl,
        prompt: effectivePrompt,
        num_generations: inpaintNumGenerations,
        generation_id: actualGenerationId,
        shot_id: shotId,
        tool_type: toolTypeOverride,
        loras: loras,
        create_as_generation: createAsGeneration, // If true, create a new generation instead of a variant
        source_variant_id: activeVariantId || undefined, // Track which variant was the source if editing from a variant
        hires_fix: convertToHiresFixApiParams(advancedSettings), // Pass hires fix settings if enabled
        qwen_edit_model: qwenEditModel,
      });

      console.log('[Reposition] Reposition inpaint tasks created successfully');

      // Show success state
      setRepositionGenerateSuccess(true);

      // Wait 1 second to show success, then clear success state (keep transform for further edits)
      setTimeout(() => {
        setRepositionGenerateSuccess(false);
        // Don't reset transform - let user keep their positioning for further edits or regeneration
      }, 1000);

    } catch (error) {
      handleError(error, { context: 'useRepositionTaskCreation', toastTitle: 'Failed to create reposition task' });
    } finally {
      setIsGeneratingReposition(false);
    }
  }, [
    selectedProjectId,
    imageDimensions,
    hasTransformChanges,
    media,
    inpaintPrompt,
    inpaintNumGenerations,
    transform,
    shotId,
    toolTypeOverride,
    loras,
    createTransformedCanvas,
    createAsGeneration,
    advancedSettings,
    activeVariantId,
    qwenEditModel,
  ]);

  return {
    isGeneratingReposition,
    repositionGenerateSuccess,
    handleGenerateReposition,
  };
}
