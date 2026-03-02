import { useState, useCallback } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { uploadImageToStorage } from '@/shared/lib/media/imageUploader';
import { createImageInpaintTask } from '@/shared/lib/tasks/imageInpaint';
import { generateMaskFromCanvas, createCanvasWithBackground } from '@/shared/lib/media/maskGeneration';
import type { ImageTransform } from './types';
import type { GenerationRow } from '@/domains/generation/types';
import type { EditAdvancedSettings, QwenEditModel } from '../useGenerationEditSettings';
import { convertToHiresFixApiParams } from '../useGenerationEditSettings';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import { useTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';

interface UseRepositionTaskCreationProps {
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

interface UseRepositionTaskCreationReturn {
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
  transform: _transform,
  hasTransformChanges,
  createAsGeneration,
  advancedSettings,
  activeVariantId,
  qwenEditModel,
  createTransformedCanvas,
}: UseRepositionTaskCreationProps): UseRepositionTaskCreationReturn {
  const [isGeneratingReposition, setIsGeneratingReposition] = useState(false);
  const [repositionGenerateSuccess, setRepositionGenerateSuccess] = useState(false);
  const run = useTaskPlaceholder();

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
      await run({
        taskType: 'image_inpaint',
        label: inpaintPrompt.trim() || 'Fill edges...',
        context: 'useRepositionTaskCreation',
        toastTitle: 'Failed to create reposition task',
        create: async () => {
          const transformedCanvas = await createTransformedCanvas();

          // Generate mask from the transparent areas of the transformed image
          const maskCanvas = generateMaskFromCanvas(transformedCanvas, {
            alphaThreshold: 200,
            dilationPixels: 3,
          });

          // Create final image with green background to prevent anti-aliased edge artifacts
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

          // Create inpaint task with transformed image and mask
          const actualGenerationId = getGenerationId(media);
          const effectivePrompt = inpaintPrompt.trim() || 'seamlessly extend and fill the edges matching the existing image style and content';

          return createImageInpaintTask({
            project_id: selectedProjectId,
            image_url: transformedUrl,
            mask_url: maskUrl,
            prompt: effectivePrompt,
            num_generations: inpaintNumGenerations,
            generation_id: actualGenerationId ?? undefined,
            shot_id: shotId,
            tool_type: toolTypeOverride,
            loras: loras,
            create_as_generation: createAsGeneration,
            source_variant_id: activeVariantId || undefined,
            hires_fix: convertToHiresFixApiParams(advancedSettings),
            qwen_edit_model: qwenEditModel,
          });
        },
        onSuccess: () => {
          setRepositionGenerateSuccess(true);
          setTimeout(() => {
            setRepositionGenerateSuccess(false);
          }, 1000);
        },
      });
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
    shotId,
    toolTypeOverride,
    loras,
    createTransformedCanvas,
    createAsGeneration,
    advancedSettings,
    activeVariantId,
    qwenEditModel,
    run,
  ]);

  return {
    isGeneratingReposition,
    repositionGenerateSuccess,
    handleGenerateReposition,
  };
}
