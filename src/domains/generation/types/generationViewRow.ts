import type { PersistedGenerationRow } from './generationRow';

/**
 * Derived display fields (read-only, produced by mappers/selectors from persisted data).
 * Ownership: mapper/query layer.
 */
export interface GenerationDerivedFields {
  imageUrl?: string;
  thumbUrl?: string;
  contentType?: string;
  derivedCount?: number;
  hasUnviewedVariants?: boolean;
  unviewedVariantCount?: number;
}

/** Domain-facing generation contract = persisted row + derived view fields. */
export type GenerationRow = PersistedGenerationRow & GenerationDerivedFields;
