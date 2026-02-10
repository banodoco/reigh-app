import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { handleError } from '@/shared/lib/errorHandler';
import { queryKeys } from '@/shared/lib/queryKeys';
import { GenerationRow } from '@/types/shots';
import { createImageUpscaleTask } from '@/shared/lib/tasks/imageUpscale';
import { getGenerationId, getMediaUrl } from '@/shared/lib/mediaTypeHelpers';
import type { ImageUpscaleSettings } from '../components/ImageUpscaleForm';
import { useIncomingTasks } from '@/shared/contexts/IncomingTasksContext';

export interface UseUpscaleProps {
  media: GenerationRow | undefined;
  selectedProjectId: string | null;
  isVideo: boolean;
  shotId?: string;
}

export interface UseUpscaleReturn {
  isUpscaling: boolean;
  upscaleSuccess: boolean;
  handleUpscale: (settings: ImageUpscaleSettings) => Promise<void>;
  /** Update the active variant info so handleUpscale uses the correct image.
   *  Call this after variant data becomes available (e.g. from useSharedLightboxState). */
  setActiveVariant: (location: string | null | undefined, id: string | null | undefined) => void;
  // Kept for backwards compatibility with other components
  showingUpscaled: boolean;
  handleToggleUpscaled: () => void;
  effectiveImageUrl: string;
  sourceUrlForTasks: string;
  isPendingUpscale: boolean;
  hasUpscaledVersion: boolean;
  upscaledUrl: string | null;
}

/**
 * Hook for managing image upscaling functionality
 *
 * Simple pattern matching other edit tasks (inpaint, etc.):
 * 1. Click button → isUpscaling = true
 * 2. Task created → upscaleSuccess = true briefly
 * 3. Reset after timeout
 *
 * Variant tracking: call setActiveVariant() after variant data is available
 * so handleUpscale upscales the currently-viewed variant (not the base generation).
 */
export const useUpscale = ({
  media,
  selectedProjectId,
  isVideo,
  shotId,
}: UseUpscaleProps): UseUpscaleReturn => {
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [upscaleSuccess, setUpscaleSuccess] = useState(false);
  const { addIncomingTask, removeIncomingTask } = useIncomingTasks();
  const queryClient = useQueryClient();

  // Get media URL
  const mediaUrl = media ? (getMediaUrl(media) || media.imageUrl || '') : '';

  // Refs for active variant info — set via setActiveVariant after variant data loads.
  // Using refs so the handleUpscale callback always reads the latest values
  // without needing them in useCallback deps (avoids hook-ordering issues).
  const activeVariantLocationRef = useRef<string | null | undefined>(null);
  const activeVariantIdRef = useRef<string | null | undefined>(null);

  const setActiveVariant = useCallback((location: string | null | undefined, id: string | null | undefined) => {
    activeVariantLocationRef.current = location;
    activeVariantIdRef.current = id;
  }, []);

  const handleUpscale = useCallback(async (settings: ImageUpscaleSettings) => {
    if (!media || !selectedProjectId || isVideo) {
      return;
    }

    // Use active variant's location if viewing a variant, otherwise use base generation URL
    const activeVariantLocation = activeVariantLocationRef.current;
    const activeVariantId = activeVariantIdRef.current;
    const effectiveImageUrl = activeVariantLocation || mediaUrl;

    setIsUpscaling(true);
    const incomingTaskId = addIncomingTask({
      taskType: 'image-upscale',
      label: `Upscale ${settings.scaleFactor}x`,
    });
    try {
      if (!effectiveImageUrl) {
        throw new Error('No image URL available');
      }

      const actualGenerationId = getGenerationId(media);

      await createImageUpscaleTask({
        project_id: selectedProjectId,
        image_url: effectiveImageUrl,
        generation_id: actualGenerationId,
        source_variant_id: activeVariantId || undefined,
        scale_factor: settings.scaleFactor,
        noise_scale: settings.noiseScale,
        shot_id: shotId,
      });

      // Show success state briefly
      setUpscaleSuccess(true);
      setTimeout(() => {
        setUpscaleSuccess(false);
      }, 2000);

    } catch (error) {
      handleError(error, { context: 'useUpscale', toastTitle: 'Failed to create enhance task' });
    } finally {
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.paginatedAll });
      await queryClient.refetchQueries({ queryKey: queryKeys.tasks.statusCountsAll });
      removeIncomingTask(incomingTaskId);
      setIsUpscaling(false);
    }
  }, [media, selectedProjectId, isVideo, mediaUrl, shotId, addIncomingTask, removeIncomingTask, queryClient]);

  return {
    isUpscaling,
    upscaleSuccess,
    handleUpscale,
    setActiveVariant,
    // Backwards compatibility - these features removed but APIs kept
    showingUpscaled: false,
    handleToggleUpscaled: () => {},
    effectiveImageUrl: mediaUrl,
    sourceUrlForTasks: mediaUrl,
    isPendingUpscale: false,
    hasUpscaledVersion: false,
    upscaledUrl: null,
  };
};
