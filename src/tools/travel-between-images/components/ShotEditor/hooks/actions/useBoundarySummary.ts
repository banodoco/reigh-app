/**
 * useBoundarySummary - Computes per-boundary crossfade status for join segment slots.
 *
 * Fetches variant params for each segment's primary variant and checks whether
 * adjacent segments have valid continuation overlap (fresh predecessor tracking).
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { checkBoundaryFreshness, type BoundaryFreshness } from './joinSegmentFreshness';
import type { SegmentSlot } from '@/shared/hooks/segments/useSegmentOutputsForShot';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function useBoundarySummary(joinSegmentSlots: SegmentSlot[]): BoundaryFreshness[] | undefined {
  const readySlots = useMemo(
    () =>
      joinSegmentSlots.filter(
        (slot): slot is Extract<SegmentSlot, { type: 'child' }> =>
          slot.type === 'child' && Boolean(slot.child?.location),
      ),
    [joinSegmentSlots],
  );

  // Collect variant IDs we need to fetch params for
  const variantIds = useMemo(() => {
    const ids: string[] = [];
    for (const slot of readySlots) {
      const pvid = slot.child?.primary_variant_id;
      if (typeof pvid === 'string') ids.push(pvid);
    }
    return ids;
  }, [readySlots]);

  // Fetch variant params for all primary variants
  const { data: variantParamsMap } = useQuery({
    queryKey: ['boundary-summary-variants', ...variantIds],
    queryFn: async () => {
      if (variantIds.length === 0) return new Map<string, Record<string, unknown>>();
      const { data } = await supabase()
        .from('generation_variants')
        .select('id, params')
        .in('id', variantIds);
      return new Map(
        (data ?? []).map((v) => [v.id, asRecord(v.params) ?? {}]),
      );
    },
    enabled: variantIds.length > 0 && readySlots.length >= 2,
    staleTime: 30_000,
  });

  return useMemo(() => {
    if (!variantParamsMap || readySlots.length < 2) return undefined;

    const boundaries: BoundaryFreshness[] = [];
    for (let i = 0; i < readySlots.length - 1; i++) {
      const predecessorPvid = readySlots[i].child?.primary_variant_id ?? null;
      const successorPvid = readySlots[i + 1].child?.primary_variant_id ?? null;
      const successorParams = successorPvid ? variantParamsMap.get(successorPvid) ?? null : null;
      boundaries.push(checkBoundaryFreshness(predecessorPvid, successorParams));
    }
    return boundaries;
  }, [variantParamsMap, readySlots]);
}
