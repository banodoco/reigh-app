import { useCallback } from 'react';
import type { ImageTransform } from './types';
import type { GenerationRow } from '@/types/shots';
import { getMediaUrl } from '@/shared/lib/mediaTypeHelpers';

interface UseCanvasTransformProps {
  transform: ImageTransform;
  imageDimensions: { width: number; height: number } | null;
  media: GenerationRow;
  /** Active variant's image URL - use this instead of media.url when editing a variant */
  activeVariantLocation?: string | null;
}

interface UseCanvasTransformReturn {
  /** Get CSS transform style for preview rendering */
  getTransformStyle: () => React.CSSProperties;
  /** Create a canvas with the transformed image at source resolution */
  createTransformedCanvas: () => Promise<HTMLCanvasElement>;
}

/**
 * Hook for CSS transform generation and canvas manipulation.
 * Handles both preview rendering (CSS) and actual canvas transformation (for saving/uploading).
 */
export function useCanvasTransform({
  transform,
  imageDimensions,
  media,
  activeVariantLocation,
}: UseCanvasTransformProps): UseCanvasTransformReturn {
  // Get CSS transform style for rendering preview
  const getTransformStyle = useCallback((): React.CSSProperties => {
    const scaleX = transform.flipH ? -transform.scale : transform.scale;
    const scaleY = transform.flipV ? -transform.scale : transform.scale;

    // Use percentage-based CSS transforms directly
    // This ensures the preview matches the saved result regardless of display scaling
    // translateX/translateY are already percentages (0-100)
    // CSS translate() with % is relative to the element's own dimensions
    return {
      transform: `translate(${transform.translateX}%, ${transform.translateY}%) scale(${scaleX}, ${scaleY}) rotate(${transform.rotation}deg)`,
      transformOrigin: 'center center',
    };
  }, [transform]);

  // Helper function to create transformed canvas
  const createTransformedCanvas = useCallback(async (): Promise<HTMLCanvasElement> => {
    if (!imageDimensions) {
      throw new Error('Missing image dimensions');
    }

    // Get the source image - use variant URL if editing a variant
    const mediaUrl = getMediaUrl(media) || media.imageUrl;
    const sourceUrl = activeVariantLocation || mediaUrl;
    if (!sourceUrl) {
      throw new Error('Missing source URL');
    }

    // Load the source image
    const img = new Image();
    img.crossOrigin = 'anonymous';

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = sourceUrl;
    });

    // Use actual source image dimensions for output quality
    // The output canvas matches the source image size to avoid quality loss
    const sourceWidth = img.naturalWidth;
    const sourceHeight = img.naturalHeight;

    // Create transformed image canvas at source resolution
    const transformedCanvas = document.createElement('canvas');
    transformedCanvas.width = sourceWidth;
    transformedCanvas.height = sourceHeight;
    const transformedCtx = transformedCanvas.getContext('2d');

    if (!transformedCtx) {
      throw new Error('Could not create canvas context');
    }

    // Clear canvas with transparent background
    // Note: We keep it transparent here so mask generation can use alpha channel.
    // The green/black fill happens later when preparing the image for upload.
    transformedCtx.clearRect(0, 0, sourceWidth, sourceHeight);

    // Apply transform and draw image
    transformedCtx.save();

    // Move to center of output canvas
    transformedCtx.translate(sourceWidth / 2, sourceHeight / 2);

    // Apply user transforms - translateX/translateY are percentages of the displayed dimensions
    // Convert to pixels in source image space
    const translateXPx = (transform.translateX / 100) * sourceWidth;
    const translateYPx = (transform.translateY / 100) * sourceHeight;
    transformedCtx.translate(translateXPx, translateYPx);

    // Apply scale with flip
    const scaleX = transform.flipH ? -transform.scale : transform.scale;
    const scaleY = transform.flipV ? -transform.scale : transform.scale;
    transformedCtx.scale(scaleX, scaleY);

    transformedCtx.rotate((transform.rotation * Math.PI) / 180);

    // Draw image centered at source dimensions
    transformedCtx.drawImage(
      img,
      -sourceWidth / 2,
      -sourceHeight / 2,
      sourceWidth,
      sourceHeight
    );

    transformedCtx.restore();

    return transformedCanvas;
  }, [imageDimensions, media, transform, activeVariantLocation]);

  return {
    getTransformStyle,
    createTransformedCanvas,
  };
}
