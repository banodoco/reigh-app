type VariantPreviewSource = {
  location?: string | null;
  thumbnail_url?: string | null;
  is_primary?: boolean | null;
} | null | undefined;

type GenerationPreviewSource = {
  location?: string | null;
  imageUrl?: string | null;
  thumbUrl?: string | null;
};

/**
 * Resolve the preview for the variant currently displayed in the lightbox.
 * A generation-level thumbnail belongs to its source object, so it is valid
 * for a primary variant (or an explicitly matching object) only.
 */
export function resolveVariantThumbnailUrl(
  variant: VariantPreviewSource,
  generation: GenerationPreviewSource,
): string | undefined {
  if (variant?.thumbnail_url) return variant.thumbnail_url;

  const generationThumbnail = generation.thumbUrl || undefined;
  if (!generationThumbnail) return undefined;

  if (!variant || variant.is_primary !== false) return generationThumbnail;

  const variantLocation = variant.location;
  if (variantLocation && (
    variantLocation === generation.location
    || variantLocation === generation.imageUrl
  )) {
    return generationThumbnail;
  }

  return undefined;
}
