/**
 * Hook for downloading all shot images as a zip file.
 */

import { useCallback, useState } from 'react';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { getDisplayUrl } from '@/shared/lib/mediaUrl';
import type { GenerationRow } from '@/domains/generation/types';

export interface UseDownloadImagesReturn {
  /** Whether a download is currently in progress */
  isDownloadingImages: boolean;
  /** Handler to download all images as a zip file */
  handleDownloadAllImages: () => Promise<void>;
}

interface UseDownloadImagesProps {
  /** Array of images to download */
  images: GenerationRow[];
  /** Shot name for the zip filename */
  shotName?: string;
}

export function useDownloadImages({
  images,
  shotName,
}: UseDownloadImagesProps): UseDownloadImagesReturn {
  const [isDownloadingImages, setIsDownloadingImages] = useState(false);

  const handleDownloadAllImages = useCallback(async () => {
    if (!images || images.length === 0) {
      toast.error("No images to download");
      return;
    }

    setIsDownloadingImages(true);

    try {
      // Dynamic import JSZip
      const JSZipModule = await import('jszip');
      const zip = new JSZipModule.default();

      // Sort images by position for consistent ordering
      const sortedImages = [...images].sort((a, b) => {
        const posA = a.timeline_frame ?? 0;
        const posB = b.timeline_frame ?? 0;
        return posA - posB;
      });

      // Process images sequentially to avoid overwhelming the server
      for (let i = 0; i < sortedImages.length; i++) {
        const image = sortedImages[i];
        const accessibleImageUrl = getDisplayUrl(image.imageUrl || image.location || '');

        try {
          // Fetch the image blob
          const response = await fetch(accessibleImageUrl);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
          }

          const blob = await response.blob();

          // Determine file extension
          let fileExtension = 'png'; // Default fallback
          const contentType = blob.type || image.metadata?.content_type;

          if (contentType && typeof contentType === 'string') {
            if (contentType.includes('jpeg') || contentType.includes('jpg')) {
              fileExtension = 'jpg';
            } else if (contentType.includes('png')) {
              fileExtension = 'png';
            } else if (contentType.includes('webp')) {
              fileExtension = 'webp';
            } else if (contentType.includes('gif')) {
              fileExtension = 'gif';
            }
          }

          // Generate zero-padded filename
          const paddedNumber = String(i + 1).padStart(3, '0');
          const filename = `${paddedNumber}.${fileExtension}`;

          // Add to zip
          zip.file(filename, blob);
        } catch (error) {
          normalizeAndPresentError(error, { context: 'ImageDownload', toastTitle: `Failed to process image ${i + 1}` });
          // Continue with other images, don't fail the entire operation
        }
      }

      // Generate zip file
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      // Create download
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;

      // Generate filename with shot name and timestamp
      const now = new Date();
      const timestamp = now.toISOString().slice(0, 16).replace(/[:-]/g, '').replace('T', '-');
      const sanitizedShotName = shotName ? shotName.replace(/[^a-zA-Z0-9-_]/g, '-') : 'shot';
      a.download = `${sanitizedShotName}-${timestamp}.zip`;

      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (error) {
      normalizeAndPresentError(error, { context: 'ImageDownload', toastTitle: 'Could not create zip file' });
    } finally {
      setIsDownloadingImages(false);
    }
  }, [images, shotName]);

  return {
    isDownloadingImages,
    handleDownloadAllImages,
  };
}
