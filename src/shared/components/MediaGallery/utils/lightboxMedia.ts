import type { GenerationRow } from '@/domains/generation/types';
import { getGenerationId } from '@/shared/lib/media/mediaTypeHelpers';
import type { GeneratedImageWithMetadata } from '../types';

export interface MediaGalleryLightboxMedia extends GenerationRow {
  location: string | null;
  metadata: GeneratedImageWithMetadata['metadata'] | null;
  starred: boolean;
}

interface BuildMediaGalleryLightboxMediaInput {
  activeMedia: GeneratedImageWithMetadata;
  sourceMedia?: GeneratedImageWithMetadata;
}

function sanitizeLightboxMetadata(
  metadata: GeneratedImageWithMetadata['metadata'] | undefined,
): GeneratedImageWithMetadata['metadata'] | null {
  if (!metadata) {
    return null;
  }

  const { __autoEnterEditMode: _autoEnterEditMode, ...cleanMetadata } = metadata;
  return cleanMetadata;
}

export function buildMediaGalleryLightboxMedia({
  activeMedia,
  sourceMedia,
}: BuildMediaGalleryLightboxMediaInput): MediaGalleryLightboxMedia {
  const preferredMedia = sourceMedia ?? activeMedia;
  const fallbackMedia = activeMedia;
  const mediaUrl = preferredMedia.location
    ?? preferredMedia.url
    ?? fallbackMedia.location
    ?? fallbackMedia.url
    ?? null;

  return {
    id: preferredMedia.id,
    generation_id: preferredMedia.generation_id
      ?? fallbackMedia.generation_id
      ?? getGenerationId(preferredMedia)
      ?? getGenerationId(fallbackMedia)
      ?? undefined,
    location: mediaUrl,
    imageUrl: mediaUrl ?? undefined,
    thumbUrl: preferredMedia.thumbUrl
      ?? fallbackMedia.thumbUrl
      ?? mediaUrl
      ?? undefined,
    type: preferredMedia.type ?? fallbackMedia.type ?? null,
    createdAt: preferredMedia.createdAt ?? fallbackMedia.createdAt,
    metadata: sanitizeLightboxMetadata(preferredMedia.metadata ?? fallbackMedia.metadata),
    name: preferredMedia.name ?? fallbackMedia.name ?? null,
    timeline_frame: preferredMedia.timeline_frame ?? fallbackMedia.timeline_frame ?? null,
    starred: preferredMedia.starred ?? fallbackMedia.starred ?? false,
    based_on: preferredMedia.based_on ?? fallbackMedia.based_on ?? null,
    parent_generation_id: preferredMedia.parent_generation_id ?? fallbackMedia.parent_generation_id ?? null,
    is_child: preferredMedia.is_child ?? fallbackMedia.is_child,
    child_order: preferredMedia.child_order ?? fallbackMedia.child_order ?? null,
    contentType: preferredMedia.contentType ?? fallbackMedia.contentType,
  };
}
