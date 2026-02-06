/**
 * VariantSelector Utilities
 *
 * Shared helper functions used by VariantSelector and its sub-components.
 */

import { Scissors, Sparkles, Film } from 'lucide-react';
import { VARIANT_TYPE } from '@/shared/constants/variantTypes';
import type { GenerationVariant } from '@/shared/hooks/useVariants';

/** Get icon component for a variant type */
export const getVariantIcon = (variantType: string | null) => {
  switch (variantType) {
    case 'trimmed':
      return Scissors;
    case 'upscaled':
      return Sparkles;
    case 'magic_edit':
      return Sparkles;
    case 'original':
    default:
      return Film;
  }
};

/** Get display label for a variant */
export const getVariantLabel = (variant: GenerationVariant): string => {
  if (variant.variant_type === 'trimmed') {
    const params = variant.params;
    const trimmedDuration = params?.trimmed_duration as number | undefined;
    if (trimmedDuration) {
      return `Trimmed (${trimmedDuration.toFixed(1)}s)`;
    }
    return 'Trimmed';
  }
  if (variant.variant_type === 'upscaled') {
    return 'Upscaled';
  }
  if (variant.variant_type === VARIANT_TYPE.ORIGINAL) {
    return 'Original';
  }
  if (variant.variant_type === 'magic_edit') {
    return 'Magic Edit';
  }
  return variant.variant_type || 'Variant';
};

/**
 * Check if variant is "new" (hasn't been viewed yet).
 * For currently active variant, always return false for instant feedback.
 */
export const isNewVariant = (variant: GenerationVariant, activeVariantId: string | null): boolean => {
  if (variant.id === activeVariantId) return false;
  return variant.viewed_at === null;
};

/** Get human-readable time ago string */
export const getTimeAgo = (createdAt: string): string => {
  const created = new Date(createdAt).getTime();
  const now = Date.now();
  const diffMs = now - created;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return `${seconds}s ago`;
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
};

/**
 * Check if a variant has settings that can be loaded into any form.
 * - Travel segment variants: have generative settings (prompt, model, loras)
 * - Video enhance variants: have processing settings (interpolation, upscale)
 * - Trimmed/clip_join: no loadable settings
 */
export const hasLoadableSettings = (variant: GenerationVariant): boolean => {
  const nonLoadableTypes = ['trimmed', 'clip_join', 'join_final_stitch'];
  if (variant.variant_type && nonLoadableTypes.includes(variant.variant_type)) {
    return false;
  }

  const params = variant.params;
  if (!params) return false;

  const taskType = (params.task_type || params.created_from) as string | undefined;
  if (taskType === 'video_enhance') {
    return true;
  }

  const hasPrompt = !!params.prompt;
  const hasOrchestratorDetails = !!params.orchestrator_details;

  return hasPrompt || hasOrchestratorDetails;
};

/** Data about the current segment images on the timeline */
export interface CurrentSegmentImagesData {
  startUrl?: string;
  endUrl?: string;
  startGenerationId?: string;
  endGenerationId?: string;
  startVariantId?: string;
  endVariantId?: string;
}

/**
 * Extract the storage path portion from a URL for comparison.
 * Storage paths like "/storage/v1/object/public/generations/..." may appear
 * as full URLs or relative paths depending on context.
 */
const extractStoragePath = (url: string | undefined | null): string | null => {
  if (!url) return null;
  // Find the storage path portion (everything after /storage/v1/object/...)
  const storageMatch = url.match(/\/storage\/v1\/object\/(?:public|sign)\/(.+?)(?:\?|$)/);
  if (storageMatch) return storageMatch[1];
  // If it's already a relative storage path, use it directly
  if (url.startsWith('generations/') || url.startsWith('/generations/')) {
    return url.replace(/^\//, '');
  }
  return url;
};

/**
 * Compare two URLs for equality, normalizing storage paths.
 */
const urlsMatch = (url1: string | undefined | null, url2: string | undefined | null): boolean => {
  if (!url1 || !url2) return false;
  if (url1 === url2) return true;
  const path1 = extractStoragePath(url1);
  const path2 = extractStoragePath(url2);
  return !!path1 && !!path2 && path1 === path2;
};

/**
 * Check if a variant was generated using different source images than what's
 * currently on the timeline. Used to show the "Load images" button.
 *
 * Comparison strategy:
 * 1. If generation IDs differ → images are different
 * 2. If generation IDs match but variant IDs differ (and both available) → different
 * 3. If variant IDs not available → fall back to URL comparison
 * 4. Otherwise → same images
 */
export const hasDifferentSourceImages = (
  variant: GenerationVariant,
  currentImages: CurrentSegmentImagesData | undefined,
): boolean => {
  if (!currentImages) return false;

  const params = variant.params;
  if (!params) return false;

  // Non-generative variants don't have source images
  const nonImageTypes = ['trimmed', 'clip_join', 'join_final_stitch', 'upscaled', 'magic_edit'];
  if (variant.variant_type && nonImageTypes.includes(variant.variant_type)) {
    return false;
  }

  // Extract source data from variant params
  const indivParams = (params.individual_segment_params || {}) as Record<string, unknown>;
  const variantStartGenId = (indivParams.start_image_generation_id || params.start_image_generation_id) as string | undefined;
  const variantEndGenId = (indivParams.end_image_generation_id || params.end_image_generation_id) as string | undefined;
  const variantStartVariantId = (indivParams.start_image_variant_id || params.start_image_variant_id) as string | undefined;
  const variantEndVariantId = (indivParams.end_image_variant_id || params.end_image_variant_id) as string | undefined;

  // Get resolved image paths for URL comparison
  const resolvedPaths = (indivParams.input_image_paths_resolved || params.input_image_paths_resolved) as string[] | undefined;
  const variantStartUrl = resolvedPaths?.[0] || (indivParams.start_image_url || params.start_image_url) as string | undefined;
  const variantEndUrl = resolvedPaths && resolvedPaths.length > 1
    ? resolvedPaths[resolvedPaths.length - 1]
    : (indivParams.end_image_url || params.end_image_url) as string | undefined;

  // Need at least some source image data to compare
  if (!variantStartGenId && !variantStartUrl) return false;

  // Compare start image
  const startDiffers = checkImageDiffers(
    variantStartGenId, currentImages.startGenerationId,
    variantStartVariantId, currentImages.startVariantId,
    variantStartUrl, currentImages.startUrl,
  );

  // Compare end image (only if both have end images)
  const hasEndImage = !!(variantEndGenId || variantEndUrl);
  const currentHasEndImage = !!(currentImages.endGenerationId || currentImages.endUrl);
  const endDiffers = hasEndImage && currentHasEndImage && checkImageDiffers(
    variantEndGenId, currentImages.endGenerationId,
    variantEndVariantId, currentImages.endVariantId,
    variantEndUrl, currentImages.endUrl,
  );

  return startDiffers || !!endDiffers;
};

/** Check if a single image position differs between variant source and current timeline */
function checkImageDiffers(
  variantGenId: string | undefined,
  currentGenId: string | undefined,
  variantVariantId: string | undefined,
  currentVariantId: string | undefined,
  variantUrl: string | undefined,
  currentUrl: string | undefined,
): boolean {
  // If generation IDs are available and differ, images are different
  if (variantGenId && currentGenId && variantGenId !== currentGenId) {
    return true;
  }

  // Same generation - check if variant IDs differ (different variant of same generation)
  if (variantGenId && currentGenId && variantGenId === currentGenId) {
    if (variantVariantId && currentVariantId && variantVariantId !== currentVariantId) {
      return true;
    }
    // Same generation, no variant IDs to compare → fall back to URL
    if (!variantVariantId || !currentVariantId) {
      return !urlsMatch(variantUrl, currentUrl);
    }
    return false;
  }

  // No generation IDs available → URL comparison only
  return !urlsMatch(variantUrl, currentUrl);
}

export type RelationshipFilter = 'all' | 'parents' | 'children';
