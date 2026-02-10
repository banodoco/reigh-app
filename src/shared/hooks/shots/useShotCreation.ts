/**
 * Composite shot creation operations.
 * These combine multiple operations (upload, create, add) into unified workflows.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';
import { toast } from '@/shared/components/ui/sonner';
import { handleError } from '@/shared/lib/errorHandler';
import { uploadImageToStorage } from '@/shared/lib/imageUploader';
import {
  generateClientThumbnail,
  uploadImageWithThumbnail,
} from '@/shared/lib/clientThumbnailGenerator';
import { cropImageToProjectAspectRatio } from '@/shared/lib/imageCropper';
import { parseRatio } from '@/shared/lib/aspectRatios';
import { invalidateGenerationsSync } from '@/shared/hooks/useGenerationInvalidation';
import { queryKeys } from '@/shared/lib/queryKeys';
import { useCreateShot } from './useShotsCrud';
import { useAddImageToShot, useAddImageToShotWithoutPosition } from './useShotGenerationMutations';
import { VARIANT_TYPE } from '@/shared/constants/variantTypes';

// ============================================================================
// HELPER: Create generation for uploaded image
// ============================================================================

const createGenerationForUploadedImage = async (
  imageUrl: string,
  fileName: string,
  fileType: string,
  fileSize: number,
  projectId: string,
  thumbnailUrl?: string
) => {
  const generationParams = {
    source: 'upload',
    original_filename: fileName,
    file_type: fileType,
    file_size: fileSize,
  };

  const { data, error } = await supabase
    .from('generations')
    .insert({
      project_id: projectId,
      type: 'image',
      location: imageUrl,
      thumbnail_url: thumbnailUrl || imageUrl,
      params: generationParams,
    })
    .select()
    .single();

  if (error) throw error;

  // Create the original variant
  await supabase.from('generation_variants').insert({
    generation_id: data.id,
    location: imageUrl,
    thumbnail_url: thumbnailUrl || imageUrl,
    is_primary: true,
    variant_type: VARIANT_TYPE.ORIGINAL,
    name: 'Original',
    params: generationParams,
  });

  return data;
};

// ============================================================================
// CREATE SHOT WITH IMAGE (atomic)
// ============================================================================

interface CreateShotWithImageResponse {
  shot_id: string;
  shot_name: string;
  shot_generation_id: string;
  success: boolean;
}

export const useCreateShotWithImage = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      shotName,
      generationId,
    }: {
      projectId: string;
      shotName: string;
      generationId: string;
    }) => {

      const { data, error } = await supabase
        .rpc('create_shot_with_image', {
          p_project_id: projectId,
          p_shot_name: shotName,
          p_generation_id: generationId,
        })
        .single();

      if (error) {
        console.error('[CreateShotWithImage] RPC Error:', error);
        throw error;
      }

      const typedData = data as CreateShotWithImageResponse;

      if (!typedData?.success) {
        throw new Error('Failed to create shot with image');
      }

      return {
        shotId: typedData.shot_id,
        shotName: typedData.shot_name,
        shotGenerationId: typedData.shot_generation_id,
      };
    },

    onSuccess: (data, variables) => {

      // Mark queries stale but don't refetch immediately (performance optimization)
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.shots.all, variables.projectId],
        refetchType: 'inactive',
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.unified.projectPrefix(variables.projectId),
        refetchType: 'inactive',
      });

      if (data.shotId) {
        invalidateGenerationsSync(queryClient, data.shotId, {
          reason: 'create-shot-with-image',
          scope: 'all',
          delayMs: 100,
        });
      }
    },

    onError: (error: Error) => {
      handleError(error, { context: 'useShotCreation', toastTitle: 'Failed to create shot with image' });
    },
  });
};

// ============================================================================
// HANDLE EXTERNAL IMAGE DROP
// ============================================================================

export const useHandleExternalImageDrop = () => {
  const createShotMutation = useCreateShot();
  const addImageToShotMutation = useAddImageToShot();
  const addImageToShotWithoutPositionMutation = useAddImageToShotWithoutPosition();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (variables: {
      imageFiles: File[];
      targetShotId: string | null;
      currentProjectQueryKey: string | null;
      currentShotCount: number;
      skipAutoPosition?: boolean;
      positions?: number[];
      onProgress?: (fileIndex: number, fileProgress: number, overallProgress: number) => void;
      skipOptimistic?: boolean;
    }) => {
      const {
        imageFiles,
        targetShotId,
        currentProjectQueryKey,
        currentShotCount,
        skipAutoPosition,
        positions,
        onProgress,
        skipOptimistic,
      } = variables;

      if (!currentProjectQueryKey) {
        toast.error("Cannot add image(s): current project is not identified.");
        return null;
      }
      const projectIdForOperation = currentProjectQueryKey;

      let shotId = targetShotId;
      const generationIds: string[] = [];

      // --- CROP IMAGES TO SHOT ASPECT RATIO ---

      let targetAspectRatio: number | null = null;
      let aspectRatioSource = 'none';
      let shouldCrop = true;

      try {
        const { data: projectData } = await supabase
          .from('projects')
          .select('aspect_ratio, settings')
          .eq('id', projectIdForOperation)
          .single();

        let shotData = null;
        if (shotId) {
          const { data } = await supabase
            .from('shots')
            .select('aspect_ratio')
            .eq('id', shotId)
            .single();
          shotData = data;
        }

        const uploadSettings = (projectData?.settings as Record<string, unknown> | null)?.upload as Record<string, unknown> | undefined;
        shouldCrop = uploadSettings?.cropToProjectSize ?? true;

        const shotRatioStr = shotData?.aspect_ratio;
        const projectRatioStr = projectData?.aspect_ratio;
        const effectiveRatioStr = shotRatioStr || projectRatioStr;

        if (effectiveRatioStr) {
          targetAspectRatio = parseRatio(effectiveRatioStr);
          aspectRatioSource = shotRatioStr ? 'shot' : 'project';
        }
      } catch (err) {
        console.warn('Error fetching aspect ratio settings:', err);
      }

      // Crop images if enabled
      let processedFiles = imageFiles;
      if (shouldCrop && targetAspectRatio && !isNaN(targetAspectRatio)) {
        console.log(
          `[ImageDrop] Cropping ${imageFiles.length} images to ${aspectRatioSource} aspect ratio: ${targetAspectRatio}`
        );

        try {
          const cropPromises = imageFiles.map(async file => {
            try {
              if (!file.type.startsWith('image/')) return file;

              const result = await cropImageToProjectAspectRatio(file, targetAspectRatio as number);
              if (result) {
                return result.croppedFile;
              }
              return file;
            } catch (e) {
              console.warn(`Failed to crop image ${file.name}:`, e);
              return file;
            }
          });

          processedFiles = await Promise.all(cropPromises);
        } catch (e) {
          console.error('Error during batch cropping:', e);
          processedFiles = imageFiles;
        }
      }

      // --- PROCESS FILES ---

      try {
        // Create a new shot if needed
        if (!shotId) {
          const newShotName = `Shot ${currentShotCount + 1}`;
          const result = await createShotMutation.mutateAsync({
            name: newShotName,
            projectId: projectIdForOperation,
            shouldSelectAfterCreation: true,
          });
          if (result?.shot?.id) {
            shotId = result.shot.id;
          } else {
            toast.error('Failed to create new shot.');
            return null;
          }
        }

        if (!shotId) {
          toast.error('Cannot add images to an unknown shot.');
          return null;
        }

        // Process each file
        for (let fileIndex = 0; fileIndex < processedFiles.length; fileIndex++) {
          const imageFile = processedFiles[fileIndex];
          let newGeneration: Database['public']['Tables']['generations']['Row'] | null = null;

          try {
            // Generate thumbnail and upload
            console.log(
              `[ThumbnailGenDebug] Starting client-side thumbnail generation for ${imageFile.name}`
            );
            let imageUrl = '';
            let thumbnailUrl = '';

            try {
              const {
                data: { session },
              } = await supabase.auth.getSession();
              if (!session?.user?.id) {
                throw new Error('User not authenticated');
              }
              const userId = session.user.id;

              const thumbnailResult = await generateClientThumbnail(imageFile, 300, 0.8);

              const uploadResult = await uploadImageWithThumbnail(
                imageFile,
                thumbnailResult.thumbnailBlob,
                userId,
                onProgress
                  ? progress => {
                      const overallProgress = Math.round(
                        ((fileIndex + progress / 100) / processedFiles.length) * 100
                      );
                      onProgress(fileIndex, progress, overallProgress);
                    }
                  : undefined
              );
              imageUrl = uploadResult.imageUrl;
              thumbnailUrl = uploadResult.thumbnailUrl;
            } catch (thumbnailError) {
              console.warn(
                `[ThumbnailGenDebug] Client-side thumbnail generation failed for ${imageFile.name}:`,
                thumbnailError
              );
              // Fallback to original upload
              imageUrl = await uploadImageToStorage(
                imageFile,
                3,
                onProgress
                  ? progress => {
                      const overallProgress = Math.round(
                        ((fileIndex + progress / 100) / processedFiles.length) * 100
                      );
                      onProgress(fileIndex, progress, overallProgress);
                    }
                  : undefined
              );
              thumbnailUrl = imageUrl;
            }

            if (!imageUrl) {
              toast.error(`Failed to upload image ${imageFile.name} to storage.`);
              continue;
            }

            // Create generation record
            try {
              newGeneration = await createGenerationForUploadedImage(
                imageUrl,
                imageFile.name,
                imageFile.type,
                imageFile.size,
                projectIdForOperation,
                thumbnailUrl
              );
            } catch (generationError) {
              toast.error(
                `Failed to create generation data for ${imageFile.name}: ${(generationError as Error).message}`
              );
              continue;
            }

            if (!newGeneration?.id) {
              toast.error(`Failed to create generation record for ${imageFile.name}.`);
              continue;
            }

            // Add generation to shot
            const explicitPosition =
              positions && positions.length > fileIndex ? positions[fileIndex] : undefined;

            if (explicitPosition !== undefined) {
              await addImageToShotMutation.mutateAsync({
                shot_id: shotId,
                generation_id: newGeneration.id as string,
                project_id: projectIdForOperation,
                imageUrl: newGeneration.location || undefined,
                thumbUrl: thumbnailUrl || newGeneration.location || undefined,
                timelineFrame: explicitPosition,
                skipOptimistic,
              });
            } else if (skipAutoPosition) {
              await addImageToShotWithoutPositionMutation.mutateAsync({
                shot_id: shotId,
                generation_id: newGeneration.id as string,
                project_id: projectIdForOperation,
                imageUrl: newGeneration.location || undefined,
                thumbUrl: thumbnailUrl || newGeneration.location || undefined,
              });
            } else {
              await addImageToShotMutation.mutateAsync({
                shot_id: shotId,
                generation_id: newGeneration.id as string,
                project_id: projectIdForOperation,
                imageUrl: newGeneration.location || undefined,
                thumbUrl: thumbnailUrl || newGeneration.location || undefined,
                skipOptimistic,
              });
            }

            generationIds.push(newGeneration.id as string);
          } catch (fileError) {
            console.error('[TimelineUploadDebug] CAUGHT ERROR processing file:', {
              fileName: imageFile?.name,
              message: (fileError as Error)?.message,
              stack: (fileError as Error)?.stack,
              fileError,
            });
            handleError(fileError, { context: 'useShotCreation', toastTitle: `Failed to process file ${imageFile.name}` });
          }
        }

        if (generationIds.length > 0) {
          return { shotId, generationIds };
        } else {
          return null;
        }
      } catch (error) {
        console.error('[TimelineUploadDebug] CAUGHT ERROR in useHandleExternalImageDrop:', {
          message: (error as Error)?.message,
          stack: (error as Error)?.stack,
          error,
        });
        handleError(error, { context: 'useShotCreation', toastTitle: 'Failed to process dropped image(s)' });
        return null;
      }
    },
  });

  return mutation;
};
