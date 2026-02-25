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

/**
 * Optimistic/runtime-only overlays not persisted in canonical generation rows.
 * Ownership: UI interaction/mutation layer.
 */
export interface GenerationOptimisticOverlayFields {
  isOptimistic?: boolean;
}

/** Domain-facing generation contract = persisted row + derived view fields. */
export type GenerationRow = PersistedGenerationRow & GenerationDerivedFields;

/** UI-facing generation contract with optimistic/runtime overlays. */
export type GenerationUiRow = GenerationRow & GenerationOptimisticOverlayFields;
