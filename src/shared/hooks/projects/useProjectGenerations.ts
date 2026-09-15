/**
 * Project-Wide Generation Queries
 * ================================
 *
 * This module provides hooks for querying generations at the PROJECT level.
 * Mutations live in `useGenerationMutations.ts`.
 *
 * ## Data Source
 * Bridge gallery reads (doc-27 §4.1): bounded keyset pages from
 * `GET /projects/:slug/generations` (R12) via the frozen `AstridLocalClient`.
 * The project id doubles as the bridge project slug — the composition point
 * is the existing project-selection context, not a new singleton.
 *
 * ## Filter posture
 * The v1 route supports only the `starred` filter server-side; media type and
 * tool type are applied client-side after Runtime summary metadata is mapped.
 * Search/shot filters remain compatibility-only because the v1 summary has no
 * search text or shot placement.
 *
 * @module useProjectGenerations
 */

import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { useMemo } from 'react';
import type { GeneratedImageWithMetadata } from '@/shared/components/MediaGallery/types';
import { AstridLocalClient } from '@/integrations/astrid/client';
import type { BridgeGenerationSummary } from '@/tools/video-editor/data/bridgeContract';
import { useSmartPollingConfig } from '../useSmartPolling';
import { unifiedGenerationQueryKeys } from '@/shared/lib/queryKeys/unified';
import { transformGeneration, type RawGeneration } from '@/shared/lib/generationTransformers';
import { bridgeMediaUrl } from '@/shared/lib/media/bridgeMediaUrl';
import { getProjectSelectionFallbackId } from '@/shared/contexts/projectSelectionStore';
import { useAstridCapabilityCensus } from '@/integrations/astrid/capabilityCensus.ts';
import { isImageMedia, isVideoMedia } from '@/shared/lib/media/mediaTypeFilters';
import { ReighRuntimeClient } from '@/integrations/runtime/client';
import type { Generation, GenerationVariant } from '@/integrations/runtime/generated';

/** Cache garbage collection time for paginated generation queries */
const GENERATIONS_GC_TIME_MS = 10 * 60 * 1000; // 10 minutes

/** The bridge caps one gallery page at 200 rows (doc-27 §4.1). */
const BRIDGE_MAX_PAGE_LIMIT = 200;


export interface GenerationFilters {
  toolType?: string;
  mediaType?: 'all' | 'image' | 'video';
  shotId?: string;
  excludePositioned?: boolean;
  starredOnly?: boolean;
  searchTerm?: string;
}

/**
 * Map one bridge summary row into the raw record shape `transformGeneration`
 * consumes. Display URLs are resolved here: the primary variant's managed
 * media id becomes a same-origin R9 content-route address.
 */
function toRawGeneration(row: BridgeGenerationSummary, projectSlug: string): RawGeneration {
  const primaryMediaUrl = row.primary ? bridgeMediaUrl(projectSlug, row.primary.media_id) : null;
  return {
    id: row.generation_id,
    location: primaryMediaUrl,
    thumbnail_url: primaryMediaUrl,
    type: row.type,
    created_at: row.created_at,
    updated_at: row.updated_at,
    starred: row.starred,
    name: row.name,
    params: row.params,
    derivedCount: row.variant_count,
  };
}

const RUNTIME_GALLERY_PAGE_LIMIT = 50;
type RuntimeGalleryClient = Pick<ReighRuntimeClient, 'listGenerations' | 'listVariants' | 'objectContentUrl'>;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function listAllRuntimeVariants(
  client: RuntimeGalleryClient,
  generationId: string,
): Promise<GenerationVariant[]> {
  const variants: GenerationVariant[] = [];
  let cursor: string | undefined;
  do {
    const page = await client.listVariants(generationId, cursor, RUNTIME_GALLERY_PAGE_LIMIT);
    variants.push(...page.items);
    const nextCursor = page.next_cursor ?? undefined;
    if (nextCursor !== undefined && nextCursor === cursor) {
      throw new Error(`Runtime variant cursor repeated for generation ${generationId}`);
    }
    cursor = nextCursor;
  } while (cursor !== undefined);
  return variants;
}

function toRuntimeGalleryItem(
  client: RuntimeGalleryClient,
  generation: Generation,
  variants: GenerationVariant[],
): GeneratedImageWithMetadata {
  const primaryVariant = variants.find((variant) => (
    variant.metadata.is_primary === true || variant.variant_type === 'original'
  )) ?? variants[0];
  const objectId = primaryVariant?.object_id?.trim() || null;
  const objectUrl = objectId ? client.objectContentUrl(objectId) : null;
  const metadata = asRecord(generation.metadata);
  const nestedParams = asRecord(metadata.params);
  const params = { ...nestedParams, ...metadata };
  const contentType = typeof params.content_type === 'string' ? params.content_type : undefined;
  const primaryVariantMetadata = asRecord(primaryVariant?.metadata);
  const primaryVariantMediaType = typeof primaryVariantMetadata.media_type === 'string'
    && primaryVariantMetadata.media_type.trim().length > 0
    ? primaryVariantMetadata.media_type.trim()
    : undefined;
  // Runtime's variant contract permits the coarse `image`/`video` media
  // values. The existing gallery predicates consume MIME prefixes, so map
  // those canonical coarse values to stable display MIME types at this
  // boundary without changing the Runtime wire data.
  const galleryMediaType = primaryVariantMediaType === 'image'
    ? 'image/png'
    : primaryVariantMediaType === 'video'
      ? 'video/mp4'
      : primaryVariantMediaType;
  const type = generation.type || (contentType === 'video' ? 'video' : 'image');

  const item = transformGeneration({
    id: generation.generation_id,
    location: objectUrl,
    thumbnail_url: objectUrl,
    primary_variant_id: primaryVariant?.variant_id ?? null,
    type,
    created_at: generation.created_at,
    updated_at: generation.updated_at,
    params,
    starred: metadata.starred === true,
    name: typeof metadata.name === 'string' ? metadata.name : null,
    tasks: generation.source_task_id ?? null,
    derivedCount: variants.length,
    storage_mode: 'remote',
    local_file_mime: galleryMediaType ?? null,
  });
  return {
    ...item,
    // Runtime's canonical variant metadata is the authoritative MIME signal
    // when a generation row intentionally carries neutral metadata.
    contentType: galleryMediaType ?? item.contentType,
    generation_id: generation.generation_id,
  };
}

function matchesRuntimeGalleryFilters(
  item: GeneratedImageWithMetadata,
  filters?: GenerationFilters,
): boolean {
  if (!matchesClientSideFilters(item, filters)) return false;
  if (filters?.starredOnly && !item.starred) return false;
  if (filters?.searchTerm) {
    const query = filters.searchTerm.trim().toLowerCase();
    if (query && !`${item.name ?? ''} ${item.prompt ?? ''}`.toLowerCase().includes(query)) {
      return false;
    }
  }
  return true;
}

/** Read the existing Runtime generation/variant pages through the gallery's existing data shape. */
export async function fetchRuntimeGenerationsForProject(
  client: RuntimeGalleryClient,
  projectId: string,
  limit = 100,
  offset = 0,
  filters?: GenerationFilters,
): Promise<GenerationsPaginatedResponse> {
  const requestedLimit = Math.max(1, limit);
  const targetCount = offset + requestedLimit;
  const items: GeneratedImageWithMetadata[] = [];
  let cursor: string | undefined;
  let exhausted = false;

  while (items.length < targetCount && !exhausted) {
    const page = await client.listGenerations(projectId, cursor, RUNTIME_GALLERY_PAGE_LIMIT);
    const mapped = await Promise.all(page.items.map(async (generation) => (
      toRuntimeGalleryItem(client, generation, await listAllRuntimeVariants(client, generation.generation_id))
    )));
    items.push(...mapped.filter((item) => matchesRuntimeGalleryFilters(item, filters)));

    const nextCursor = page.next_cursor ?? undefined;
    if (nextCursor !== undefined && nextCursor === cursor) {
      throw new Error(`Runtime generation cursor repeated for project ${projectId}`);
    }
    cursor = nextCursor;
    exhausted = cursor === undefined;
  }

  const pageItems = items.slice(offset, targetCount);
  const hasMore = !exhausted;
  return {
    items: pageItems,
    total: hasMore ? offset + pageItems.length + 1 : offset + pageItems.length,
    hasMore,
  };
}

/**
 * Client-side filter over mapped rows for predicates expressible on summary
 * data. Runtime carries the tool discriminator in `params.tool_type`, which
 * is mapped into the gallery item's display metadata.
 */
export function matchesClientSideFilters(
  item: GeneratedImageWithMetadata,
  filters?: GenerationFilters,
): boolean {
  if (filters?.mediaType && filters.mediaType !== 'all') {
    if (filters.mediaType === 'video' && !isVideoMedia(item)) return false;
    if (filters.mediaType === 'image' && !isImageMedia(item)) return false;
  }
  if (filters?.toolType) {
    const toolType = item.metadata?.tool_type;
    if (toolType !== filters.toolType && toolType !== `${filters.toolType}-reconstructed-client`) {
      return false;
    }
  }
  return true;
}

async function fetchGenerationsForProject(
  projectId: string,
  limit: number = 100,
  offset: number = 0,
  filters?: GenerationFilters
): Promise<{
  items: GeneratedImageWithMetadata[];
  total: number;
  hasMore: boolean;
}> {
  const client = new AstridLocalClient({ projectSlug: projectId });
  // Route-level filtering: R12 supports exactly `starred`.
  const starred = filters?.starredOnly ? true : undefined;
  const pageLimit = Math.min(Math.max(limit, 1), BRIDGE_MAX_PAGE_LIMIT);

  // Walk keyset pages until the requested [offset, offset+limit) window is
  // covered or the project is exhausted. Cursor pagination has no random
  // access, so page N costs N sequential reads — bounded and honest.
  const collected: GeneratedImageWithMetadata[] = [];
  let cursor: string | undefined;
  let exhausted = false;

  while (collected.length < offset + limit && !exhausted) {
    const page = await client.gallery.list({ limit: pageLimit, cursor, starred });
    for (const row of page.generations) {
      const item = transformGeneration(toRawGeneration(row, projectId));
      if (matchesClientSideFilters(item, filters)) {
        collected.push(item);
      }
    }
    cursor = page.next_cursor ?? undefined;
    exhausted = cursor === undefined;
  }

  const items = collected.slice(offset, offset + limit);
  const hasMore = !exhausted;

  // The route returns no total count. On the last page the total is exact;
  // before that it degrades to a lower bound (one past the covered window)
  // so "next page" stays reachable until the true end is observed.
  const total = hasMore ? offset + items.length + 1 : offset + items.length;

  return { items, total, hasMore };
}

export function fetchGenerations(
  projectId: string | null,
  limit: number = 100,
  offset: number = 0,
  filters?: GenerationFilters
): Promise<{
  items: GeneratedImageWithMetadata[];
  total: number;
  hasMore: boolean;
}> {
  if (!projectId) {
    return Promise.resolve({ items: [], total: 0, hasMore: false });
  }
  return fetchGenerationsForProject(projectId, limit, offset, filters);
}


export type GenerationsPaginatedResponse = {
  items: GeneratedImageWithMetadata[];
  total: number;
  hasMore: boolean;
};

export function useProjectGenerations(
  projectId: string | null,
  page: number = 1,
  limit: number = 100,
  enabled: boolean = true,
  filters?: GenerationFilters,
  options?: {
    disablePolling?: boolean; // Disable smart polling (useful for long-running tasks)
    /** Explicit Runtime gallery authority; legacy bridge behavior is unchanged when absent. */
    runtimeProjectId?: string | null;
  }
) {
  const capabilityCensus = useAstridCapabilityCensus();
  const offset = (page - 1) * limit;
  const runtimeProjectId = options?.runtimeProjectId?.trim() || null;
  const runtimeMode = runtimeProjectId !== null;
  const effectiveProjectId = runtimeProjectId ?? projectId ?? getProjectSelectionFallbackId();
  const filtersKey = filters ? JSON.stringify(filters) : null;
  const baseQueryKey = unifiedGenerationQueryKeys.byProject(
    effectiveProjectId ?? '__no-project__',
    page,
    limit,
    filtersKey
  );
  const queryKey = runtimeMode ? ['runtime', ...baseQueryKey] : baseQueryKey;


  // Use DataFreshnessManager for intelligent polling decisions.
  const smartPollingConfig = useSmartPollingConfig(['generations', effectiveProjectId ?? '__no-project__']);
  const pollingDisabled = Boolean(options?.disablePolling)
    || capabilityCensus.capabilities.generations === 'unavailable';
  const pollingConfig: { refetchInterval: number | false; staleTime: number } = runtimeMode
    ? { refetchInterval: pollingDisabled ? false : 2_000, staleTime: 0 }
    : pollingDisabled
    ? { refetchInterval: false, staleTime: Infinity }
    : smartPollingConfig;
  const runtimeClient = useMemo(
    () => runtimeMode ? new ReighRuntimeClient() : null,
    [runtimeMode],
  );

  const result = useQuery<GenerationsPaginatedResponse, Error>({
    queryKey: queryKey,
    queryFn: () => runtimeMode
      ? fetchRuntimeGenerationsForProject(runtimeClient!, effectiveProjectId!, limit, offset, filters)
      : fetchGenerationsForProject(effectiveProjectId!, limit, offset, filters),
    enabled: !!effectiveProjectId && enabled
      && (runtimeMode || capabilityCensus.capabilities.generations !== 'unavailable'),
    // Use `placeholderData` with `keepPreviousData` to prevent UI flashes on pagination/filter changes
    placeholderData: keepPreviousData,
    // Cache management to prevent memory leaks as pagination grows
    gcTime: GENERATIONS_GC_TIME_MS,
    refetchOnWindowFocus: false, // Prevent double-fetches

    // Intelligent polling based on realtime health (or disabled)
    ...pollingConfig,
    refetchIntervalInBackground: !pollingDisabled, // Only poll in background if polling is enabled
    refetchOnReconnect: false, // Prevent double-fetches
  });

  return result;
}
