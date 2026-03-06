import type { GenerationVariant } from '@/shared/hooks/variants/useVariants';

const NON_IMAGE_VARIANT_TYPES = new Set([
  'trimmed',
  'clip_join',
  'join_final_stitch',
  'upscaled',
  'magic_edit',
]);

const STORAGE_PATH_REGEX = /\/storage\/v1\/object\/(?:public|sign)\/(.+?)(?:\?|$)/;

type VariantParams = Record<string, unknown>;

export interface CurrentSegmentImagesData {
  startUrl?: string;
  endUrl?: string;
  startGenerationId?: string;
  endGenerationId?: string;
  startVariantId?: string;
  endVariantId?: string;
}

const extractStoragePath = (url: string | undefined | null): string | null => {
  if (!url) return null;

  const storageMatch = url.match(STORAGE_PATH_REGEX);
  if (storageMatch) return storageMatch[1];

  if (url.startsWith('generations/') || url.startsWith('/generations/')) {
    return url.replace(/^\//, '');
  }

  return url;
};

const urlsMatch = (left: string | undefined | null, right: string | undefined | null): boolean => {
  if (!left || !right) return false;
  if (left === right) return true;

  const leftPath = extractStoragePath(left);
  const rightPath = extractStoragePath(right);
  return !!leftPath && !!rightPath && leftPath === rightPath;
};

function pickSourceValue<T>(
  individualParams: VariantParams,
  params: VariantParams,
  key: string
): T | undefined {
  return (individualParams[key] ?? params[key]) as T | undefined;
}

function checkImageDiffers(
  variantGenId: string | undefined,
  currentGenId: string | undefined,
  variantVariantId: string | undefined,
  currentVariantId: string | undefined,
  variantUrl: string | undefined,
  currentUrl: string | undefined,
): boolean {
  if (variantGenId && currentGenId && variantGenId !== currentGenId) {
    return true;
  }

  if (variantGenId && currentGenId && variantGenId === currentGenId) {
    if (variantVariantId && currentVariantId && variantVariantId !== currentVariantId) {
      return true;
    }

    if (!variantVariantId || !currentVariantId) {
      return !urlsMatch(variantUrl, currentUrl);
    }
    return false;
  }

  return !urlsMatch(variantUrl, currentUrl);
}

export const hasDifferentSourceImages = (
  variant: GenerationVariant,
  currentImages: CurrentSegmentImagesData | undefined,
): boolean => {
  if (!currentImages) return false;

  const params = variant.params as VariantParams | null;
  if (!params) return false;

  if (variant.variant_type && NON_IMAGE_VARIANT_TYPES.has(variant.variant_type)) {
    return false;
  }

  const individualParams = (params.individual_segment_params || {}) as VariantParams;
  const variantStartGenId = pickSourceValue<string>(individualParams, params, 'start_image_generation_id');
  const variantEndGenId = pickSourceValue<string>(individualParams, params, 'end_image_generation_id');
  const variantStartVariantId = pickSourceValue<string>(individualParams, params, 'start_image_variant_id');
  const variantEndVariantId = pickSourceValue<string>(individualParams, params, 'end_image_variant_id');

  const resolvedPaths = pickSourceValue<string[]>(individualParams, params, 'input_image_paths_resolved');
  const variantStartUrl = resolvedPaths?.[0] ||
    pickSourceValue<string>(individualParams, params, 'start_image_url');
  const variantEndUrl = resolvedPaths && resolvedPaths.length > 1
    ? resolvedPaths[resolvedPaths.length - 1]
    : pickSourceValue<string>(individualParams, params, 'end_image_url');

  if (!variantStartGenId && !variantStartUrl) {
    return false;
  }

  const startDiffers = checkImageDiffers(
    variantStartGenId,
    currentImages.startGenerationId,
    variantStartVariantId,
    currentImages.startVariantId,
    variantStartUrl,
    currentImages.startUrl,
  );

  const hasEndImage = !!(variantEndGenId || variantEndUrl);
  const currentHasEndImage = !!(currentImages.endGenerationId || currentImages.endUrl);
  const endDiffers = hasEndImage && currentHasEndImage && checkImageDiffers(
    variantEndGenId,
    currentImages.endGenerationId,
    variantEndVariantId,
    currentImages.endVariantId,
    variantEndUrl,
    currentImages.endUrl,
  );

  return startDiffers || !!endDiffers;
};
