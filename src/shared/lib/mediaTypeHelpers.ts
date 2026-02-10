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
 * // Instead of: (media as any).generation_id || media.id
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
