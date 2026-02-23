/**
 * Image Aspect Ratio Utility
 *
 * Calculates aspect ratio styles for images based on metadata or project settings.
 * Used by batch view components (ShotBatchItemMobile, ShotBatchItemDesktop).
 */

import { parseRatio } from '@/shared/lib/aspectRatios';

interface ImageWithMetadata {
  metadata?: {
    width?: number;
    height?: number;
    originalParams?: {
      orchestrator_details?: {
        resolution?: string;
      };
    };
  };
}

/**
 * Calculate aspect ratio style for an image container.
 *
 * Resolution sources (in priority order):
 * 1. Image metadata width/height
 * 2. Resolution string from originalParams (e.g., "1920x1080")
 * 3. Project aspect ratio (e.g., "16:9")
 * 4. Default to square (1:1)
 *
 * @param image - Image object with optional metadata
 * @param projectAspectRatio - Project aspect ratio string (e.g., "16:9")
 * @returns Style object with aspectRatio property
 */
export function getImageAspectRatioStyle(
  image: ImageWithMetadata,
  projectAspectRatio?: string
): { aspectRatio: string } {
  // Try to get dimensions from image metadata first
  let width = image.metadata?.width;
  let height = image.metadata?.height;

  // If not found, try to extract from resolution string
  if (!width || !height) {
    const resolution = image.metadata?.originalParams?.orchestrator_details?.resolution;
    if (resolution && typeof resolution === 'string' && resolution.includes('x')) {
      const [w, h] = resolution.split('x').map(Number);
      if (!isNaN(w) && !isNaN(h)) {
        width = w;
        height = h;
      }
    }
  }

  // If we have image dimensions, use them
  if (width && height) {
    const aspectRatio = width / height;
    return { aspectRatio: `${aspectRatio}` };
  }

  // Fall back to project aspect ratio if available
  if (projectAspectRatio) {
    const aspectRatio = parseRatio(projectAspectRatio);
    if (Number.isFinite(aspectRatio)) return { aspectRatio: `${aspectRatio}` };
  }

  // Default to square aspect ratio
  return { aspectRatio: '1' };
}
