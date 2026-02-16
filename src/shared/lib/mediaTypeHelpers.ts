/**
 * Media item that may have generation_id (from variants) or just id
 */
interface MediaWithGenerationId {
  id: string;
  generation_id?: string;
}

/**
 * Loose type for objects that might have generation_id and/or id.
 * Use this when dealing with untyped or loosely-typed media objects.
 */
interface MaybeHasGenerationId {
  generation_id?: string | null;
  id?: string | null;
  metadata?: { generation_id?: string | null };
}

/**
 * Get the canonical generation ID from a media item.
 * Handles both direct generations (id) and variants (generation_id).
 * Also checks metadata.generation_id for compatibility with various data shapes.
 *
 * Priority: generation_id > metadata.generation_id > id
 *
 * @example
 * // Instead of: (media as unknown).generation_id || media.id
 * const genId = getGenerationId(media);
 */
export function getGenerationId(
  media: MaybeHasGenerationId | null | undefined
): string | null {
  if (!media) return null;
  return media.generation_id || media.metadata?.generation_id || media.id || null;
}

/**
 * Media item with various URL properties (normalized across sources)
 */
interface MediaWithUrls {
  location?: string;
  url?: string;
  thumbnail_url?: string;
  thumbUrl?: string;
  imageUrl?: string;
}

/**
 * Get the primary URL for a media item
 */
export function getMediaUrl(media: MediaWithUrls | null | undefined): string | undefined {
  if (!media) return undefined;
  return media.location || media.url || media.imageUrl;
}

/**
 * Get the thumbnail URL for a media item
 */
export function getThumbnailUrl(media: MediaWithUrls | null | undefined): string | undefined {
  if (!media) return undefined;
  return media.thumbnail_url || media.thumbUrl;
}

/**
 * Transform a variant (GeneratedImageWithMetadata shape) to a GenerationRow shape.
 * Used by edit-video and edit-images pages for lightbox display.
 *
 * @param media The variant data
 * @param mediaType 'video' or 'image'
 * @param projectId Current project ID
 */
export function variantToGenerationRow(
  media: {
    id: string;
    url: string;
    thumbUrl?: string;
    createdAt?: string;
    starred?: boolean;
    metadata?: { prompt?: string; tool_type?: string; variant_type?: string; generation_id?: string | null };
    generation_id?: string | null;
  },
  mediaType: 'video' | 'image',
  projectId: string,
): Record<string, unknown> {
  return {
    id: getGenerationId(media),
    location: media.url,
    thumbnail_url: media.thumbUrl,
    type: mediaType,
    created_at: media.createdAt,
    params: {
      prompt: media.metadata?.prompt,
      tool_type: media.metadata?.tool_type,
      variant_type: media.metadata?.variant_type,
      variant_id: media.id,
    },
    project_id: projectId,
    starred: media.starred || false,
  };
}
