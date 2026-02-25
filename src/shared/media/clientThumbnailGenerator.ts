/**
 * Client-side thumbnail generation utility
 * Generates thumbnails from image files using Canvas API
 */

import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { uploadImageToStorage, uploadBlobToStorage } from '@/shared/lib/imageUploader';

interface ThumbnailResult {
  thumbnailBlob: Blob;
  thumbnailWidth: number;
  thumbnailHeight: number;
  originalWidth: number;
  originalHeight: number;
}

// ── promise helpers wrapping callback-based browser APIs ──────────────────

/** Read a File as a data-URL string. */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        resolve(e.target.result as string);
      } else {
        reject(new Error('Failed to read image file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}

/** Load an HTMLImageElement from a data-URL. */
function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image for thumbnail generation'));
    img.src = dataUrl;
  });
}

/**
 * Generate a thumbnail from an image file on the client side
 * @param file - The image file to generate thumbnail from
 * @param maxSize - Maximum dimension for the thumbnail (default: 300px)
 * @param quality - JPEG quality (0-1, default: 0.8)
 * @returns Promise<ThumbnailResult>
 */
export async function generateClientThumbnail(
  file: File,
  maxSize: number = 300,
  quality: number = 0.8
): Promise<ThumbnailResult> {
  const dataUrl = await readFileAsDataUrl(file);
  const img = await loadImage(dataUrl);

  const originalWidth = img.width;
  const originalHeight = img.height;

  // Calculate thumbnail dimensions (maintain aspect ratio)
  let thumbnailWidth = originalWidth;
  let thumbnailHeight = originalHeight;

  if (originalWidth > originalHeight) {
    if (originalWidth > maxSize) {
      thumbnailWidth = maxSize;
      thumbnailHeight = (originalHeight * maxSize) / originalWidth;
    }
  } else {
    if (originalHeight > maxSize) {
      thumbnailHeight = maxSize;
      thumbnailWidth = (originalWidth * maxSize) / originalHeight;
    }
  }

  // Ensure minimum size of 1px
  thumbnailWidth = Math.max(1, Math.round(thumbnailWidth));
  thumbnailHeight = Math.max(1, Math.round(thumbnailHeight));

  // Create canvas and resize image
  const canvas = document.createElement('canvas');
  canvas.width = thumbnailWidth;
  canvas.height = thumbnailHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  ctx.drawImage(img, 0, 0, thumbnailWidth, thumbnailHeight);

  // Convert canvas to blob (JPEG with specified quality)
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Failed to generate thumbnail blob'))),
      'image/jpeg',
      quality,
    );
  });

  return {
    thumbnailBlob: blob,
    thumbnailWidth,
    thumbnailHeight,
    originalWidth,
    originalHeight,
  };
}

interface UploadWithThumbnailOptions {
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}

/**
 * Upload both original image and thumbnail to storage
 * @param originalFile - The original image file
 * @param thumbnailBlob - The generated thumbnail blob
 * @param options - Optional progress callback and abort signal
 * @returns Promise<{imageUrl: string, thumbnailUrl: string}>
 */
export async function uploadImageWithThumbnail(
  originalFile: File,
  thumbnailBlob: Blob,
  options?: UploadWithThumbnailOptions
): Promise<{imageUrl: string, thumbnailUrl: string}> {
  const resolvedOptions: UploadWithThumbnailOptions = options || {};

  const { onProgress, signal } = resolvedOptions;

  // Upload original image using existing utility (with progress tracking)
  // Original image is ~90% of the work, thumbnail is ~10%
  const imageUrl = await uploadImageToStorage(originalFile, {
    maxRetries: 3,
    signal,
    onProgress: onProgress ? (progress) => {
      // Map 0-100 to 0-90 for main image
      onProgress(Math.round(progress * 0.9));
    } : undefined
  });

  // Report 90% progress before thumbnail upload
  onProgress?.(90);

  // Upload thumbnail using centralized uploader (with retry/timeout support)
  try {
    const thumbnailUrl = await uploadBlobToStorage(
      thumbnailBlob,
      'thumbnail.jpg',
      'image/jpeg',
      { maxRetries: 2, signal, timeoutMs: 30000 } // Shorter timeout for small thumbnails
    );

    // Report 100% progress after thumbnail upload
    onProgress?.(100);

    return { imageUrl, thumbnailUrl };
  } catch (thumbnailError) {
    normalizeAndPresentError(thumbnailError, { context: 'ClientThumbnailGenerator', showToast: false });
    // Don't fail the main upload, use main image as thumbnail fallback
    onProgress?.(100);
    return { imageUrl, thumbnailUrl: imageUrl };
  }
}
