/**
 * Mask generation utilities for image reposition operations.
 * Extracts mask from canvas alpha channel and dilates to eliminate edge artifacts.
 */

interface MaskGenerationOptions {
  /** Alpha threshold (0-255). Pixels with alpha above this are considered solid. Default: 200 */
  alphaThreshold?: number;
  /** Number of pixels to dilate the mask into the image. Default: 3 */
  dilationPixels?: number;
}

/**
 * Generates a mask canvas from a transformed image canvas.
 * White areas = regions to inpaint (transparent/edge areas)
 * Black areas = regions to keep (solid image content)
 *
 * The mask is dilated by a few pixels to ensure edge artifacts are included in the inpaint region.
 *
 * @param sourceCanvas - Canvas with transformed image (uses alpha channel for mask detection)
 * @param options - Configuration options for threshold and dilation
 * @returns Canvas containing the generated mask
 */
export function generateMaskFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  options: MaskGenerationOptions = {}
): HTMLCanvasElement {
  const { alphaThreshold = 200, dilationPixels = 3 } = options;

  const width = sourceCanvas.width;
  const height = sourceCanvas.height;

  const sourceCtx = sourceCanvas.getContext('2d');
  if (!sourceCtx) {
    throw new Error('Could not get source canvas context');
  }

  // Create mask canvas
  const maskCanvas = document.createElement('canvas');
  maskCanvas.width = width;
  maskCanvas.height = height;
  const maskCtx = maskCanvas.getContext('2d');

  if (!maskCtx) {
    throw new Error('Could not create mask canvas context');
  }

  // Start with white (all areas to be inpainted)
  maskCtx.fillStyle = 'white';
  maskCtx.fillRect(0, 0, width, height);

  // Get image data from both canvases
  const sourceImageData = sourceCtx.getImageData(0, 0, width, height);
  const maskImageData = maskCtx.getImageData(0, 0, width, height);

  // First pass: create initial mask based on alpha threshold
  // Pixels with alpha > threshold are considered solid (black in mask = don't inpaint)
  // Semi-transparent edge pixels will be white (inpaint these areas)
  for (let i = 0; i < sourceImageData.data.length; i += 4) {
    const alpha = sourceImageData.data[i + 3];

    if (alpha > alphaThreshold) {
      // Solid pixel - mark as black in mask (keep original)
      maskImageData.data[i] = 0;     // R
      maskImageData.data[i + 1] = 0; // G
      maskImageData.data[i + 2] = 0; // B
      maskImageData.data[i + 3] = 255; // A
    } else {
      // Transparent/semi-transparent pixel - mark as white in mask (inpaint this area)
      maskImageData.data[i] = 255;     // R
      maskImageData.data[i + 1] = 255; // G
      maskImageData.data[i + 2] = 255; // B
      maskImageData.data[i + 3] = 255; // A
    }
  }

  // Second pass: dilate the white (inpaint) region
  // This ensures we eat into the image slightly to eliminate any anti-aliased edge artifacts
  if (dilationPixels > 0) {
    const tempMaskData = new Uint8ClampedArray(maskImageData.data);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;

        // If this pixel is black (image area), check if any neighbor within dilationPixels is white
        if (tempMaskData[idx] === 0) {
          let shouldDilate = false;

          // Check neighbors in a square region
          for (let dy = -dilationPixels; dy <= dilationPixels && !shouldDilate; dy++) {
            for (let dx = -dilationPixels; dx <= dilationPixels && !shouldDilate; dx++) {
              const nx = x + dx;
              const ny = y + dy;

              // Skip out of bounds
              if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

              const neighborIdx = (ny * width + nx) * 4;
              // If neighbor is white (inpaint area), dilate this pixel
              if (tempMaskData[neighborIdx] === 255) {
                shouldDilate = true;
              }
            }
          }

          if (shouldDilate) {
            // Convert this pixel from black (keep) to white (inpaint)
            maskImageData.data[idx] = 255;     // R
            maskImageData.data[idx + 1] = 255; // G
            maskImageData.data[idx + 2] = 255; // B
            maskImageData.data[idx + 3] = 255; // A
          }
        }
      }
    }
  }

  maskCtx.putImageData(maskImageData, 0, 0);

  return maskCanvas;
}

/**
 * Creates a canvas with a solid background color and the source image drawn on top.
 * This prevents anti-aliased edge pixels from appearing as dark borders by ensuring
 * they blend with the background color.
 *
 * @param sourceCanvas - Canvas with transformed image (may have transparent areas)
 * @param backgroundColor - CSS color for the background (default: '#00FF00' green)
 * @returns Canvas with solid background and image composited on top
 */
export function createCanvasWithBackground(
  sourceCanvas: HTMLCanvasElement,
  backgroundColor: string = '#00FF00'
): HTMLCanvasElement {
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = sourceCanvas.width;
  outputCanvas.height = sourceCanvas.height;
  const outputCtx = outputCanvas.getContext('2d');

  if (!outputCtx) {
    throw new Error('Could not create output canvas context');
  }

  // Fill with background color first
  outputCtx.fillStyle = backgroundColor;
  outputCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);

  // Draw transformed image on top - anti-aliased edges will blend with background
  outputCtx.drawImage(sourceCanvas, 0, 0);

  return outputCanvas;
}
