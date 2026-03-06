import { GenerationRow } from '@/domains/generation/types';

/** Extended GenerationRow with variant tracking fields added by hooks */
interface GenerationRowWithVariant extends GenerationRow {
  _variant_id?: string;
  _variant_is_primary?: boolean;
}

/**
 * Extract a consistent variant ID from a generation row or explicit variant ID.
 * Replaces scattered `imageVariantId || (x as GenerationRowWithVariant)?._variant_id` patterns.
 */
export function getTaskVariantId(
  generation: GenerationRow | null | undefined,
  explicitVariantId?: string | null,
): string | undefined {
  if (explicitVariantId) return explicitVariantId;
  return (generation as GenerationRowWithVariant)?._variant_id;
}
