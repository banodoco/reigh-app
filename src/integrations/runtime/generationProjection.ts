import type { Generation, GenerationVariant } from './generated';

export interface RuntimeThumbnailDescriptor {
  object_id: string;
  source_object_id: string;
  recipe_version: number;
}

const SHA256_OBJECT_ID = /^sha256:[0-9a-f]{64}$/;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function runtimeThumbnailDescriptor(value: unknown): RuntimeThumbnailDescriptor | null {
  const metadata = asRecord(value);
  const thumbnail = asRecord(metadata?.thumbnail);
  if (!thumbnail) return null;
  const objectId = thumbnail.object_id;
  const sourceObjectId = thumbnail.source_object_id;
  const recipeVersion = thumbnail.recipe_version;
  if (
    typeof objectId !== 'string' || !SHA256_OBJECT_ID.test(objectId)
    || typeof sourceObjectId !== 'string' || !SHA256_OBJECT_ID.test(sourceObjectId)
    || typeof recipeVersion !== 'number' || !Number.isInteger(recipeVersion) || recipeVersion !== 1
  ) {
    return null;
  }
  return {
    object_id: objectId,
    source_object_id: sourceObjectId,
    recipe_version: recipeVersion,
  };
}

export function selectRuntimePrimaryVariant(
  variants: GenerationVariant[],
): GenerationVariant | undefined {
  return variants.find((variant) => variant.metadata.is_primary === true)
    ?? variants.find((variant) => variant.variant_type === 'original')
    ?? variants[0];
}

export function runtimeThumbnailObjectId(
  generation: Pick<Generation, 'metadata'>,
  primaryObjectId: string | null | undefined,
): string | null {
  const descriptor = runtimeThumbnailDescriptor(generation.metadata);
  if (!descriptor || !primaryObjectId || descriptor.source_object_id !== primaryObjectId) {
    return null;
  }
  return descriptor.object_id;
}
