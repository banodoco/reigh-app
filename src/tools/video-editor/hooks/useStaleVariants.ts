import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { useAppEventListener } from '@/shared/lib/typedEvents';
import type { AssetRegistryEntry, ResolvedAssetRegistryEntry } from '@/tools/video-editor/types';
import type { UseTimelineDataResult } from '@/tools/video-editor/hooks/useTimelineData';

interface PrimaryVariantInfo {
  id: string;
  location: string;
  variant_id: string;
}

interface UseStaleVariantsArgs {
  registry: Record<string, ResolvedAssetRegistryEntry> | undefined;
  patchRegistry: UseTimelineDataResult['patchRegistry'];
  registerAsset: UseTimelineDataResult['registerAsset'];
}

const STALE_VARIANTS_QUERY_KEY = ['video-editor', 'stale-variants'];

/**
 * Batch-checks which asset registry entries reference a variant that is no longer
 * the primary variant of its generation. Compares by file URL (always present)
 * rather than variantId (may be missing in older entries).
 *
 * Returns:
 * - staleAssetKeys: Set of asset keys whose file differs from current primary variant
 * - generationAssetKeys: Set of asset keys that are linked to any generation
 * - dismissedAssetKeys: Set of asset keys the user has dismissed the stale notice for
 * - dismissAsset: dismiss the stale notice for an asset key (session-only)
 * - updateAssetToCurrentVariant: update an asset to match the current primary variant
 */
export function useStaleVariants({ registry, patchRegistry, registerAsset }: UseStaleVariantsArgs) {
  const queryClient = useQueryClient();
  const [dismissedAssetKeys, setDismissedAssetKeys] = useState<Set<string>>(() => new Set());

  // Collect all asset keys linked to a generation (only need generationId, not variantId)
  const generationAssetMap = useMemo(() => {
    if (!registry) {
      return {
        generationIds: [] as string[],
        assetsByGeneration: {} as Record<string, { assetKey: string; file: string }[]>,
        generationAssetKeys: new Set<string>(),
      };
    }

    const assetsByGeneration: Record<string, { assetKey: string; file: string }[]> = {};
    const generationAssetKeys = new Set<string>();

    for (const [assetKey, entry] of Object.entries(registry)) {
      if (entry.generationId) {
        generationAssetKeys.add(assetKey);
        if (!assetsByGeneration[entry.generationId]) {
          assetsByGeneration[entry.generationId] = [];
        }
        assetsByGeneration[entry.generationId].push({ assetKey, file: entry.file });
      }
    }

    return {
      generationIds: Object.keys(assetsByGeneration),
      assetsByGeneration,
      generationAssetKeys,
    };
  }, [registry]);

  // Batch-fetch current primary variant location for all referenced generations
  const { data: primaryLocationMap } = useQuery({
    queryKey: [...STALE_VARIANTS_QUERY_KEY, generationAssetMap.generationIds],
    queryFn: async () => {
      if (generationAssetMap.generationIds.length === 0) return {};

      const { data, error } = await getSupabaseClient()
        .from('generations')
        .select(`
          id,
          primary_variant:generation_variants!generations_primary_variant_id_fkey (
            id,
            location
          )
        `)
        .in('id', generationAssetMap.generationIds);

      if (error) throw error;

      const map: Record<string, PrimaryVariantInfo | null> = {};
      for (const row of data ?? []) {
        const pv = row.primary_variant as { id: string; location: string } | null;
        map[row.id] = pv ? { id: row.id, location: pv.location, variant_id: pv.id } : null;
      }
      return map;
    },
    enabled: generationAssetMap.generationIds.length > 0,
    staleTime: 5_000,
    refetchOnMount: 'always' as const,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000,
  });

  // Listen for realtime variant changes and refetch
  const handleVariantChange = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: STALE_VARIANTS_QUERY_KEY });
  }, [queryClient]);

  useAppEventListener('realtime:variant-change-batch', handleVariantChange);

  // Build the set of stale asset keys (compare by file URL, not variantId)
  const staleAssetKeys = useMemo(() => {
    const stale = new Set<string>();
    if (!primaryLocationMap) return stale;

    for (const [generationId, assets] of Object.entries(generationAssetMap.assetsByGeneration)) {
      const primaryInfo = primaryLocationMap[generationId];
      if (!primaryInfo) continue;
      for (const { assetKey, file } of assets) {
        if (file !== primaryInfo.location) {
          stale.add(assetKey);
        }
      }
    }

    return stale;
  }, [primaryLocationMap, generationAssetMap.assetsByGeneration]);

  const dismissAsset = useCallback((assetKey: string) => {
    setDismissedAssetKeys((prev) => {
      const next = new Set(prev);
      next.add(assetKey);
      return next;
    });
  }, []);

  // Update a single asset to the current primary variant
  const updateAssetToCurrentVariant = useCallback(async (assetKey: string) => {
    if (!registry) return;
    const entry = registry[assetKey];
    if (!entry?.generationId) return;

    // Fetch the current primary variant's data
    const { data, error } = await getSupabaseClient()
      .from('generations')
      .select(`
        primary_variant_id,
        primary_variant:generation_variants!generations_primary_variant_id_fkey (
          id,
          location,
          thumbnail_url
        )
      `)
      .eq('id', entry.generationId)
      .single();

    if (error || !data?.primary_variant) return;

    const newVariant = data.primary_variant as { id: string; location: string; thumbnail_url: string | null };
    const newLocation = newVariant.location;

    const updatedEntry: AssetRegistryEntry = {
      ...entry,
      file: newLocation,
      variantId: newVariant.id,
    };

    // Update in-memory registry
    patchRegistry(assetKey, updatedEntry, newLocation);

    // Persist to DB
    void registerAsset(assetKey, updatedEntry).catch((err) => {
      console.error('[video-editor] Failed to persist variant update:', err);
    });

    // Clear dismiss state for this asset (it's now up to date)
    setDismissedAssetKeys((prev) => {
      if (!prev.has(assetKey)) return prev;
      const next = new Set(prev);
      next.delete(assetKey);
      return next;
    });

    // Refetch staleness data
    void queryClient.invalidateQueries({ queryKey: STALE_VARIANTS_QUERY_KEY });
  }, [registry, patchRegistry, registerAsset, queryClient]);

  return {
    staleAssetKeys,
    dismissedAssetKeys,
    generationAssetKeys: generationAssetMap.generationAssetKeys,
    dismissAsset,
    updateAssetToCurrentVariant,
  };
}
