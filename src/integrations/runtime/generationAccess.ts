import type { GeneratedImageWithMetadata } from '@/shared/components/MediaGallery/types';
import type { Generation, GenerationVariant } from './generated';
import type { BridgeGenerationDetailPayload } from '@/tools/video-editor/data/bridgeContract';
import { ReighRuntimeClient } from './client';
import {
  runtimeThumbnailObjectId,
  selectRuntimePrimaryVariant,
} from './generationProjection';

/**
 * Both cloud bridge reads and Runtime reads feed the same detail consumers.
 * Keep the projection assignable to the bridge contract so retained cloud
 * callers can continue to use their existing detail repository unchanged.
 */
export type GenerationDetailProjection = BridgeGenerationDetailPayload['generation'];

export interface RuntimeGenerationVariantDetail {
  id: string;
  generation_id: string;
  media_id: string;
  object_id?: string;
  variant_type?: string | null;
  name?: string | null;
  params: Record<string, unknown>;
  is_primary: boolean;
  starred: boolean;
  viewed_at: string | null;
  created_at: string;
}

export interface RuntimeSourceGenerationProjection {
  generation: GeneratedImageWithMetadata;
  primaryVariant: {
    id: string;
    location: string;
    thumbnailUrl: string | null;
    variantType: string | null;
    isPrimary: boolean;
  } | null;
}

export interface RuntimeGenerationDetail {
  generation_id: string;
  project_id: string;
  task_id: string | null;
  type: string;
  version: number;
  name: string | null;
  based_on_generation_id: string | null;
  parent_generation_id: string | null;
  child_order: number | null;
  params: Record<string, unknown>;
  starred: boolean;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
  variants: RuntimeGenerationVariantDetail[];
  items: Record<string, unknown>[];
  runtimeSource: RuntimeSourceGenerationProjection;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export async function listAllRuntimeVariants(
  client: ReighRuntimeClient,
  generationId: string,
  limit = 200,
): Promise<GenerationVariant[]> {
  const variants: GenerationVariant[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listVariants(generationId, cursor, limit);
    variants.push(...page.items);
    const nextCursor = page.next_cursor ?? undefined;
    if (nextCursor !== undefined && nextCursor === cursor) {
      throw new Error(`Runtime variant cursor repeated for generation ${generationId}`);
    }
    cursor = nextCursor;
  } while (cursor !== undefined);
  return variants;
}

export function runtimeGenerationToGalleryItem(
  client: Pick<ReighRuntimeClient, 'objectContentUrl'>,
  generation: Generation,
  variants: GenerationVariant[],
): GeneratedImageWithMetadata {
  const primary = selectRuntimePrimaryVariant(variants);
  const objectId = primary?.object_id ?? null;
  const metadata = asRecord(generation.metadata);
  const params = {
    ...asRecord(metadata.params),
    ...metadata,
  };
  const primaryMetadata = asRecord(primary?.metadata);
  const mediaType = stringValue(primaryMetadata.media_type)
    ?? stringValue(primaryMetadata.content_type)
    ?? stringValue(params.content_type);
  const variantThumbnailObjectId = primary?.thumbnail
    && primary.thumbnail.source_object_id === objectId
    ? primary.thumbnail.object_id
    : null;
  const thumbnailObjectId = runtimeThumbnailObjectId(generation, objectId) ?? variantThumbnailObjectId;
  const url = objectId ? client.objectContentUrl(objectId) : null;
  const thumbnailUrl = thumbnailObjectId ? client.objectContentUrl(thumbnailObjectId) : null;
  const isVideo = mediaType?.toLowerCase().startsWith('video/') ?? false;

  return {
    id: generation.generation_id,
    generation_id: generation.generation_id,
    url,
    location: url,
    thumbUrl: thumbnailUrl,
    urlIdentity: url ?? undefined,
    thumbUrlIdentity: thumbnailUrl ?? undefined,
    prompt: stringValue(params.prompt) ?? 'No prompt',
    metadata: params,
    createdAt: generation.created_at,
    updatedAt: generation.updated_at,
    isVideo,
    type: generation.type || (isVideo ? 'video' : 'image'),
    contentType: mediaType ?? undefined,
    starred: metadata.starred === true,
    primary_variant_id: primary?.variant_id ?? null,
    storage_mode: 'remote',
    derivedCount: variants.length,
  };
}

export async function fetchRuntimeGenerationSnapshot(
  generationId: string,
  client = new ReighRuntimeClient(),
): Promise<{ generation: Generation; variants: GenerationVariant[] } | null> {
  try {
    const generation = await client.getGeneration(generationId);
    const variants = await listAllRuntimeVariants(client, generationId);
    return { generation, variants };
  } catch (error) {
    if (error instanceof Error && 'status' in error && (error as { status?: unknown }).status === 404) {
      return null;
    }
    throw error;
  }
}

export function runtimeSnapshotToDetail(
  snapshot: { generation: Generation; variants: GenerationVariant[] },
  client: Pick<ReighRuntimeClient, 'objectContentUrl'> = new ReighRuntimeClient(),
): RuntimeGenerationDetail {
  const { generation, variants } = snapshot;
  const metadata = asRecord(generation.metadata);
  const primary = selectRuntimePrimaryVariant(variants);
  const galleryItem = runtimeGenerationToGalleryItem(client, generation, variants);
  return {
    generation_id: generation.generation_id,
    project_id: generation.project_id,
    task_id: generation.source_task_id ?? null,
    type: generation.type,
    version: generation.version,
    name: stringValue(metadata.name),
    based_on_generation_id: stringValue(metadata.based_on_generation_id) ?? stringValue(metadata.based_on),
    parent_generation_id: stringValue(metadata.parent_generation_id),
    child_order: typeof metadata.child_order === 'number' ? metadata.child_order : null,
    params: asRecord(metadata.params),
    starred: metadata.starred === true,
    deleted_at: null,
    created_at: generation.created_at,
    updated_at: generation.updated_at,
    variants: variants.map((variant) => {
      const variantMetadata = asRecord(variant.metadata);
      const mediaId = variant.object_id ? client.objectContentUrl(variant.object_id) : '';
      return {
        id: variant.variant_id,
        generation_id: variant.generation_id,
        media_id: mediaId,
        object_id: variant.object_id ?? undefined,
        variant_type: variant.variant_type,
        name: stringValue(variantMetadata.name),
        params: {
          ...asRecord(variantMetadata.params),
          ...(typeof variantMetadata.media_type === 'string'
            ? { media_type: variantMetadata.media_type }
            : {}),
          ...(typeof variantMetadata.content_type === 'string'
            ? { content_type: variantMetadata.content_type }
            : {}),
        },
        is_primary: variant.variant_id === primary?.variant_id,
        starred: variantMetadata.starred === true,
        viewed_at: variant.viewed_at ?? null,
        created_at: variant.created_at,
      };
    }),
    items: [],
    runtimeSource: {
      generation: galleryItem,
      primaryVariant: primary?.object_id ? {
        id: primary.variant_id,
        location: client.objectContentUrl(primary.object_id),
        thumbnailUrl: galleryItem.thumbUrl ?? null,
        variantType: primary.variant_type ?? null,
        isPrimary: true,
      } : null,
    },
  };
}
