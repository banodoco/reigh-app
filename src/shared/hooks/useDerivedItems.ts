/**
 * Derived Items: Generations + Variants Based on a Source Generation
 * ==================================================================
 *
 * Provides a unified view of all items derived from a source generation:
 * - Child generations (via `based_on` relationship)
 * - Edit variants (from `generation_variants` table)
 *
 * Used by the "Based on this" feature in the lightbox.
 *
 * @module useDerivedItems
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/shared/lib/errorHandling/handleError';
import { generationQueryKeys } from '@/shared/lib/queryKeys/generations';
import { calculateDerivedCountsSafe } from '@/shared/lib/generationTransformers';
import { useSmartPollingConfig } from './useSmartPolling';
import { EDIT_VARIANT_TYPES } from '@/shared/constants/variantTypes';

/**
 * A derived item can be either a generation (old mode) or a variant (new mode)
 */
export interface DerivedItem {
  id: string;
  thumbUrl: string | null;
  url: string | null;
  createdAt: string;
  derivedCount: number;
  starred?: boolean;
  prompt?: string;

  /** Discriminator: 'generation' for old based_on, 'variant' for new variant edits */
  itemType: 'generation' | 'variant';

  /** Variant-specific fields */
  variantType?: string | null;
  variantName?: string | null;
  /** When variant was first viewed (null = not viewed, shows NEW badge) */
  viewedAt?: string | null;

  /** Generation-specific fields */
  basedOn?: string | null;
  shot_id?: string;
  timeline_frame?: number | null;
  all_shot_associations?: Array<{ shot_id: string; timeline_frame: number | null; position: number | null }>;
}

/**
 * Fetch derived items: BOTH child generations (based_on) AND edit variants
 * This provides backwards compatibility while supporting the new variant model.
 */
async function fetchDerivedItems(
  sourceGenerationId: string | null
): Promise<DerivedItem[]> {
  if (!sourceGenerationId) {
    return [];
  }

  // Fetch both in parallel
  const [generationsResult, variantsResult] = await Promise.all([
    // 1. Child generations (backwards compatible - generations with based_on = this)
    // NOTE: Must specify FK explicitly to avoid ambiguous relationship error (PGRST201)
    // since there are two FKs between generations and shot_generations
    supabase
      .from('generations')
      .select(`
        id,
        location,
        thumbnail_url,
        type,
        created_at,
        params,
        starred,
        tasks,
        based_on,
        shot_generations!shot_generations_generation_id_generations_id_fk(shot_id, timeline_frame)
      `)
      .eq('based_on', sourceGenerationId)
      .order('starred', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),

    // 2. Edit variants (new mode - variants with edit types, excluding primary/original)
    supabase
      .from('generation_variants')
      .select('id, location, thumbnail_url, created_at, variant_type, name, params, is_primary, viewed_at')
      .eq('generation_id', sourceGenerationId)
      .in('variant_type', EDIT_VARIANT_TYPES)
      .eq('is_primary', false) // Exclude primary - that's the "current" version
      .order('created_at', { ascending: false })
  ]);

  if (generationsResult.error) {
    handleError(generationsResult.error, { context: 'useDerivedItems', showToast: false });
  }
  if (variantsResult.error) {
    handleError(variantsResult.error, { context: 'useDerivedItems', showToast: false });
  }

  const childGenerations = generationsResult.data || [];
  const editVariants = variantsResult.data || [];

  // Use centralized function to count variants from both generations and generation_variants tables
  const generationIds = childGenerations.map(d => d.id);
  const { derivedCounts } = await calculateDerivedCountsSafe(generationIds);

  // Normalize generations to DerivedItem format
  const normalizePosition = (timelineFrame: number | null | undefined) => {
    if (timelineFrame === null || timelineFrame === undefined) return null;
    return Math.floor(timelineFrame / 50);
  };

  const generationItems: DerivedItem[] = childGenerations.map((item) => {
    const shotGenerations = (item.shot_generations || []) as Array<{ shot_id: string; timeline_frame: number | null }>;
    const allAssociations = shotGenerations.length > 1
      ? shotGenerations.map((sg) => ({
          shot_id: sg.shot_id,
          timeline_frame: sg.timeline_frame,
          position: normalizePosition(sg.timeline_frame),
        }))
      : undefined;

    const primaryShot = shotGenerations[0];

    return {
      id: item.id,
      thumbUrl: item.thumbnail_url || item.location,
      url: item.location,
      createdAt: item.created_at,
      derivedCount: derivedCounts[item.id] || 0,
      starred: item.starred || false,
      prompt: (item.params as Record<string, unknown> | null)?.prompt as string | undefined || ((item.params as Record<string, Record<string, Record<string, unknown>>> | null)?.originalParams?.orchestrator_details?.prompt as string | undefined),
      itemType: 'generation' as const,
      basedOn: item.based_on,
      shot_id: primaryShot?.shot_id,
      timeline_frame: primaryShot?.timeline_frame,
      all_shot_associations: allAssociations,
    };
  });

  // Normalize variants to DerivedItem format
  const variantItems: DerivedItem[] = editVariants.map((variant) => ({
    id: variant.id,
    thumbUrl: variant.thumbnail_url || variant.location,
    url: variant.location,
    createdAt: variant.created_at,
    derivedCount: 0, // Variants can't have children
    starred: false, // Variants don't have starred flag
    prompt: (variant.params as Record<string, unknown> | null)?.prompt as string | undefined,
    itemType: 'variant' as const,
    variantType: variant.variant_type,
    variantName: variant.name,
    viewedAt: variant.viewed_at, // null = not viewed, shows NEW badge
  }));

  // Merge and sort by created_at (newest first), with starred generations at top
  const allItems = [...generationItems, ...variantItems].sort((a, b) => {
    // Starred items first (only generations can be starred)
    if (a.starred && !b.starred) return -1;
    if (!a.starred && b.starred) return 1;
    // Then by date (newest first)
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return allItems;
}

/**
 * Hook to fetch derived items (generations + variants based on this generation)
 * Used for the unified "Based on this" feature.
 */
export function useDerivedItems(
  sourceGenerationId: string | null,
  enabled: boolean = true
) {
  // Smart polling so new edits appear immediately
  const smartPollingConfig = useSmartPollingConfig(generationQueryKeys.derived(sourceGenerationId!));

  return useQuery<DerivedItem[], Error>({
    queryKey: generationQueryKeys.derived(sourceGenerationId!),
    queryFn: () => fetchDerivedItems(sourceGenerationId),
    enabled: !!sourceGenerationId && enabled,
    gcTime: 5 * 60 * 1000, // 5 minutes

    // Intelligent polling based on realtime health
    ...smartPollingConfig,
    refetchIntervalInBackground: true, // Continue polling when tab inactive
    refetchOnWindowFocus: false, // Prevent double-fetches
    refetchOnReconnect: false, // Prevent double-fetches
  });
}
