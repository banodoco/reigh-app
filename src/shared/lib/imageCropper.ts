import { handleError } from '@/shared/lib/errorHandling/handleError';

interface ProjectCropResult {
  croppedFile: File;
  croppedImageUrl: string;
}

// Tolerance for aspect ratio matching - if within this, skip re-encoding
const ASPECT_RATIO_TOLERANCE = 0.01;

/**
 * Crops an image to a specific aspect ratio (for project dimensions).
 * Preserves quality by:
 * - Skipping re-encoding if aspect ratio already matches
 * - Using maximum quality (1.0) when re-encoding is necessary
 * - Preserving original format (PNG/WebP stay lossless)
 *
 * @param inputFile The image file to crop
 * @param targetAspectRatio The target aspect ratio as a number (width / height)
 * @returns Promise with the cropped file and image URL
 */
export const cropImageToProjectAspectRatio = async (
  inputFile: File,
  targetAspectRatio: number
): Promise<ProjectCropResult | null> => {

  // Mobile browsers (especially iOS) sometimes provide files with an empty MIME type
  // or HEIC/HEIF types. Treat known image extensions as images even if MIME is missing.
  const hasImageMime = typeof inputFile.type === 'string' && inputFile.type.startsWith('image/');
  const looksLikeImageByName = typeof inputFile.name === 'string' && /\.(heic|heif|jpg|jpeg|png|webp|gif|bmp|tif|tiff)$/i.test(inputFile.name);

  if (!hasImageMime && !looksLikeImageByName) {
    handleError(new Error(`Invalid file type: ${inputFile?.name} (${inputFile?.type})`), { context: 'imageCropper:invalidFileType', showToast: false });
    return null;
  }

  if (isNaN(targetAspectRatio) || targetAspectRatio <= 0) {
    handleError(new Error(`Invalid target aspect ratio: ${targetAspectRatio}`), { context: 'imageCropper:invalidAspectRatio', showToast: false });
    return null;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const originalWidth = img.width;
        const originalHeight = img.height;
        const originalAspectRatio = originalWidth / originalHeight;

        // If aspect ratio already matches within tolerance, skip re-encoding to preserve quality
        const aspectDiff = Math.abs(originalAspectRatio - targetAspectRatio);
        if (aspectDiff < ASPECT_RATIO_TOLERANCE) {
          const croppedImageUrl = URL.createObjectURL(inputFile);
          resolve({
            croppedFile: inputFile,
            croppedImageUrl,
          });
          return;
        }

        let cropX = 0;
        let cropY = 0;
        let newCanvasWidth = originalWidth;
        let newCanvasHeight = originalHeight;

        // Calculate new dimensions for cropping, maintaining center
        if (originalAspectRatio > targetAspectRatio) {
          // Original image is wider than target, crop width
          newCanvasWidth = originalHeight * targetAspectRatio;
          newCanvasHeight = originalHeight;
          cropX = (originalWidth - newCanvasWidth) / 2;
        } else if (originalAspectRatio < targetAspectRatio) {
          // Original image is taller than target, crop height
          newCanvasWidth = originalWidth;
          newCanvasHeight = originalWidth / targetAspectRatio;
          cropY = (originalHeight - newCanvasHeight) / 2;
        }

        const canvas = document.createElement("canvas");
        canvas.width = Math.round(newCanvasWidth);
        canvas.height = Math.round(newCanvasHeight);
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }

        // Use high-quality image smoothing for any scaling
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';

        // Draw the cropped portion of the image onto the canvas
        ctx.drawImage(
          img,
          cropX, // source X
          cropY, // source Y
          newCanvasWidth, // source width
          newCanvasHeight, // source height
          0, // destination X
          0, // destination Y
          canvas.width, // destination width
          canvas.height // destination height
        );

        // Preserve original format, fallback to JPEG for unsupported types
        const outputMime = /^(image\/(jpeg|png|webp))$/i.test(inputFile.type)
          ? inputFile.type
          : 'image/jpeg';

        // Use maximum quality (1.0) for JPEG/WebP to minimize quality loss
        const quality = 1.0;

        canvas.toBlob(
          async (blob) => {
            if (!blob) {
              try {
                const dataUrl = canvas.toDataURL(outputMime, quality);
                blob = await (await fetch(dataUrl)).blob();
              } catch {
                reject(new Error("Failed to create blob from canvas"));
                return;
              }
            }

            const fileExt = outputMime === 'image/png' ? 'png' : outputMime === 'image/webp' ? 'webp' : 'jpg';
            const safeName = inputFile.name.replace(/\.[^/.]+$/, `.${fileExt}`);
            const croppedFile = new File([blob], safeName, {
              type: outputMime,
              lastModified: Date.now(),
            });
            const croppedImageUrl = URL.createObjectURL(croppedFile);
            resolve({
              croppedFile,
              croppedImageUrl,
            });
          },
          outputMime,
          quality
        );
      };
      img.onerror = (err) => {
        reject(new Error("Failed to load image: " + err));
      };
      if (event.target?.result) {
        img.src = event.target.result as string;
      } else {
        reject(new Error("Failed to read file for cropping."));
      }
    };
    reader.onerror = (err) => {
      reject(new Error("FileReader error: " + err));
    };
    reader.readAsDataURL(inputFile);
  });
}; 
