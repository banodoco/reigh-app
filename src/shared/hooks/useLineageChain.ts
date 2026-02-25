/**
 * useLineageChain Hook
 *
 * Fetches the full lineage chain for a variant by following the `source_variant_id` field in params.
 * Returns an array ordered from oldest ancestor to newest (the provided variant).
 *
 * Note: Lineage is tracked at the variant level via params.source_variant_id,
 * not at the generation level via based_on.
 */

import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { generationQueryKeys } from '@/shared/lib/queryKeys/generations';
import {
  resolveVariantProjectScope,
  type VariantProjectScopeStatus,
} from '@/shared/lib/generationTaskRepository';

interface LineageItem {
  id: string;
  imageUrl: string;
  thumbnailUrl: string | null;
  createdAt: string;
  type: 'variant';
  variantType: string | null;
}

interface LineageChainResult {
  chain: LineageItem[];
  isLoading: boolean;
  hasLineage: boolean;
  error: LineageScopeError | null;
}

interface VariantRecord {
  id: string;
  generation_id: string;
  params: Record<string, unknown> | null;
  location: string;
  thumbnail_url: string | null;
  created_at: string;
  variant_type: string | null;
}

type LineageScopeFailureStatus = Exclude<VariantProjectScopeStatus, 'ok'>;

export class LineageScopeError extends Error {
  readonly status: LineageScopeFailureStatus;
  readonly variantId: string;
  readonly projectId: string;
  readonly queryError?: string;

  constructor(params: {
    status: LineageScopeFailureStatus;
    variantId: string;
    projectId: string;
    queryError?: string;
    message: string;
  }) {
    super(params.message);
    this.name = 'LineageScopeError';
    this.status = params.status;
    this.variantId = params.variantId;
    this.projectId = params.projectId;
    this.queryError = params.queryError;
  }
}

export function isLineageScopeError(error: unknown): error is LineageScopeError {
  return error instanceof LineageScopeError;
}

function readSourceVariantId(params: Record<string, unknown> | null): string | null {
  return typeof params?.source_variant_id === 'string' ? params.source_variant_id : null;
}

function buildScopeValidationErrorMessage(scopeStatus: string, queryError?: string): string {
  switch (scopeStatus) {
    case 'scope_mismatch':
      return 'Variant exists but does not belong to the active project scope';
    case 'missing_project_scope':
      return 'Variant does not have project scope metadata';
    case 'missing_variant':
      return 'Variant not found';
    case 'missing_generation':
      return 'Variant generation was not found';
    case 'query_failed':
      return `Variant scope lookup failed${queryError ? `: ${queryError}` : ''}`;
    default:
      return `Variant scope validation failed (${scopeStatus})`;
  }
}

function toLineageScopeError(
  error: unknown,
  fallback: {
    variantId: string;
    projectId: string;
    status: LineageScopeFailureStatus;
    queryError?: string;
  },
): LineageScopeError {
  if (isLineageScopeError(error)) {
    return error;
  }

  const message = error instanceof Error
    ? error.message
    : buildScopeValidationErrorMessage(fallback.status, fallback.queryError);

  return new LineageScopeError({
    ...fallback,
    message,
  });
}

async function fetchVariantById(variantId: string, projectId: string): Promise<VariantRecord> {
  const scope = await resolveVariantProjectScope(variantId, projectId);
  if (scope.status !== 'ok' || !scope.generationId) {
    throw new LineageScopeError({
      status: scope.status as LineageScopeFailureStatus,
      variantId,
      projectId,
      queryError: scope.queryError,
      message: buildScopeValidationErrorMessage(scope.status, scope.queryError),
    });
  }

  const { data, error } = await getSupabaseClient().from('generation_variants')
    .select('id, generation_id, params, location, thumbnail_url, created_at, variant_type')
    .eq('id', variantId)
    .eq('generation_id', scope.generationId)
    .single();

  if (error) {
    throw toLineageScopeError(error, {
      status: 'query_failed',
      variantId,
      projectId,
      queryError: error.message,
    });
  }

  if (!data) {
    throw new LineageScopeError({
      status: 'missing_variant',
      variantId,
      projectId,
      message: buildScopeValidationErrorMessage('missing_variant'),
    });
  }
  return data as VariantRecord;
}

/**
 * Recursively fetch the lineage chain for a variant.
 * Follows `params.source_variant_id` across generation boundaries.
 */
async function fetchLineageChain(variantId: string, projectId: string): Promise<LineageItem[]> {
  const chain: LineageItem[] = [];
  const visited = new Set<string>();
  let currentId: string | null = variantId;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const variant = await fetchVariantById(currentId, projectId);

    chain.unshift({
      id: variant.id,
      imageUrl: variant.location,
      thumbnailUrl: variant.thumbnail_url,
      createdAt: variant.created_at,
      type: 'variant',
      variantType: variant.variant_type,
    });
    currentId = readSourceVariantId(variant.params);
  }

  return chain;
}

/**
 * Hook to fetch the full lineage chain for a variant.
 *
 * @param variantId - The variant ID to fetch lineage for
 * @param projectId - Project scope required for lineage traversal
 * @returns Object with chain (oldest to newest), loading state, and whether there's lineage
 */
export function useLineageChain(variantId: string | null, projectId: string | null): LineageChainResult {
  const { data: chain = [], isLoading, error } = useQuery<LineageItem[], LineageScopeError>({
    queryKey: [...generationQueryKeys.lineageChain(variantId!), projectId ?? '__no-project__'],
    queryFn: async () => {
      try {
        return await fetchLineageChain(variantId!, projectId!);
      } catch (caughtError) {
        const normalizedError = toLineageScopeError(caughtError, {
          status: 'query_failed',
          variantId: variantId!,
          projectId: projectId!,
        });
        normalizeAndPresentError(normalizedError, {
          context: 'useLineageChain',
          showToast: false,
          logData: {
            variantId: normalizedError.variantId,
            projectId: normalizedError.projectId,
            status: normalizedError.status,
            queryError: normalizedError.queryError,
          },
        });
        throw normalizedError;
      }
    },
    enabled: !!variantId && !!projectId,
    staleTime: 5 * 60 * 1000, // 5 minutes - lineage doesn't change
    gcTime: 10 * 60 * 1000, // 10 minutes
  });

  return {
    chain,
    isLoading,
    // Has lineage if chain has more than 1 item (the current variant + at least one ancestor)
    hasLineage: chain.length > 1,
    error: error ?? null,
  };
}

/**
 * Count the lineage chain length for a variant.
 * Returns the number of ancestors (0 if no lineage, 1+ if has ancestors).
 * This fetches directly without caching - use sparingly for initial checks.
 *
 * Reuses fetchLineageChain to avoid duplicating the traversal logic.
 */
export async function getLineageDepth(variantId: string, projectId: string): Promise<number> {
  const chain = await fetchLineageChain(variantId, projectId);
  // chain includes the variant itself; ancestors = chain length - 1
  return Math.max(0, chain.length - 1);
}

// NOTE: Default export removed - use named export { useLineageChain } instead
