/**
 * Shared download logic for ImageLightbox and VideoLightbox
 *
 * Resolves the correct URL (from intended variant or effective URL),
 * extracts prompt for filename, and delegates to downloadMedia.
 */

import type { GenerationVariant } from '@/shared/hooks/useVariants';
import type { GenerationRow } from '@/domains/generation/types';
import { readSegmentOverrides } from '@/shared/lib/settingsMigration';
import { downloadMedia } from '@/shared/lib/media/downloadMedia';

interface LightboxDownloadOptions {
  /** Ref to the variant the user intends to download (synchronous, avoids race condition) */
  intendedVariantId: string | null;
  /** All loaded variants */
  variants: GenerationVariant[];
  /** Fallback URL when no variant matches */
  fallbackUrl: string;
  /** The media object for id, metadata, params, contentType */
  media: GenerationRow;
  /** Whether this is a video download */
  isVideo: boolean;
  /** Called with true/false to manage download loading state */
  setIsDownloading: (v: boolean) => void;
}

/**
 * Execute a lightbox download with variant resolution and prompt-based filename.
 */
export async function handleLightboxDownload({
  intendedVariantId,
  variants,
  fallbackUrl,
  media,
  isVideo,
  setIsDownloading,
}: LightboxDownloadOptions): Promise<void> {
  let urlToDownload: string | undefined;

  if (intendedVariantId && variants.length > 0) {
    const intendedVariant = variants.find((v) => v.id === intendedVariantId);
    if (intendedVariant?.location) {
      urlToDownload = intendedVariant.location;
    }
  }

  if (!urlToDownload) {
    urlToDownload = fallbackUrl;
  }

  if (!urlToDownload) return;

  setIsDownloading(true);
  try {
    const segmentOverrides = readSegmentOverrides(media.metadata as Record<string, unknown> | null);
    const prompt = media.params?.prompt ||
                   (media.metadata as Record<string, unknown> | undefined)?.enhanced_prompt as string | undefined ||
                   segmentOverrides.prompt ||
                   (media.metadata as Record<string, unknown> | undefined)?.prompt as string | undefined;
    await downloadMedia(urlToDownload, media.id, isVideo, media.contentType, prompt);
  } finally {
    setIsDownloading(false);
  }
}
