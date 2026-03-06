import { useState, useCallback, useRef } from 'react';
import { GenerationRow } from '@/domains/generation/types';
import { createImageUpscaleTask } from '@/shared/lib/tasks/imageUpscale';
import { getGenerationId, getMediaUrl } from '@/shared/lib/media/mediaTypeHelpers';
import type { ImageUpscaleSettings } from '../components/ImageUpscaleForm';
import { useTaskPlaceholder } from '@/shared/hooks/tasks/useTaskPlaceholder';

interface UseUpscaleProps {
  media: GenerationRow | undefined;
  selectedProjectId: string | null;
  isVideo: boolean;
  shotId?: string;
}

interface UseUpscaleReturn {
  isUpscaling: boolean;
  upscaleSuccess: boolean;
  handleUpscale: (settings: ImageUpscaleSettings) => Promise<void>;
  /** Update the active variant info so handleUpscale uses the correct image.
   *  Call this after variant data becomes available (e.g. from useSharedLightboxState). */
  setActiveVariant: (location: string | null | undefined, id: string | null | undefined) => void;
  effectiveImageUrl: string;
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
  const run = useTaskPlaceholder();

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
    try {
      await run({
        taskType: 'image-upscale',
        label: `Upscale ${settings.scaleFactor}x`,
        context: 'useUpscale',
        toastTitle: 'Failed to create enhance task',
        create: async () => {
          if (!effectiveImageUrl) {
            throw new Error('No image URL available');
          }

          const actualGenerationId = getGenerationId(media);

          return createImageUpscaleTask({
            project_id: selectedProjectId,
            image_url: effectiveImageUrl,
            generation_id: actualGenerationId,
            source_variant_id: activeVariantId || undefined,
            scale_factor: settings.scaleFactor,
            noise_scale: settings.noiseScale,
            shot_id: shotId,
          });
        },
        onSuccess: () => {
          // Show success state briefly
          setUpscaleSuccess(true);
          setTimeout(() => {
            setUpscaleSuccess(false);
          }, 2000);
        },
      });
    } finally {
      setIsUpscaling(false);
    }
  }, [media, selectedProjectId, isVideo, mediaUrl, shotId, run]);

  return {
    isUpscaling,
    upscaleSuccess,
    handleUpscale,
    setActiveVariant,
    effectiveImageUrl: mediaUrl,
  };
};
