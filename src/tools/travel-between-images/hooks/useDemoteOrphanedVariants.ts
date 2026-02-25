/**
 * Hook to demote orphaned video variants when source images change.
 *
 * When timeline images are replaced, reordered, or deleted, existing videos
 * can become "orphaned" - they no longer match their source images. This hook
 * calls an RPC to detect and demote these variants (set is_primary: false).
 */

import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { queryKeys } from '@/shared/lib/queryKeys';

export function useDemoteOrphanedVariants() {
  const queryClient = useQueryClient();

  const demoteOrphanedVariants = useCallback(async (shotId: string, _triggerReason?: string): Promise<number> => {
    if (!shotId) {
      return 0;
    }

    try {

      // Query video variants that exist for this shot before demotion
      await supabase().from('generations')
        .select(`
          id,
          pair_shot_generation_id,
          child_order,
          params,
          generation_variants!inner (id, is_primary)
        `)
        .eq('is_child', true)
        .eq('type', 'video')
        .not('pair_shot_generation_id', 'is', null);

      // Check what's currently at each shot_generation slot
      await supabase().from('shot_generations')
        .select('id, generation_id, timeline_frame')
        .eq('shot_id', shotId)
        .order('timeline_frame', { ascending: true });

      const { data, error } = await supabase().rpc('demote_orphaned_video_variants', { p_shot_id: shotId });

      if (error) {
        normalizeAndPresentError(error, { context: 'useDemoteOrphanedVariants', showToast: false, logData: { shotId: shotId.substring(0, 8) } });
        return 0;
      }

      const demotedCount = data ?? 0;

      if (demotedCount > 0) {

        // Query which variants were demoted (they'll now have is_primary = false but no other primary)
        await supabase().from('generations')
          .select(`
            id,
            location,
            thumbnail_url,
            primary_variant_id,
            pair_shot_generation_id,
            generation_variants (id, is_primary, location)
          `)
          .eq('is_child', true)
          .eq('type', 'video')
          .is('location', null); // Demoted generations have cleared location

        // Invalidate relevant queries to refresh UI
        // Partial key match for all segment children (predicate invalidation)
        queryClient.invalidateQueries({ queryKey: queryKeys.segments.childrenAll });
        queryClient.invalidateQueries({ queryKey: queryKeys.generations.byShot(shotId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.segments.parents(shotId) });
        // Invalidate source image change detection for video warning indicators
        // Partial key match for all source slots (predicate invalidation)
        queryClient.invalidateQueries({ queryKey: queryKeys.segments.sourceSlotAll });
      }

      return demotedCount;
    } catch (error) {
      normalizeAndPresentError(error, { context: 'useDemoteOrphanedVariants', showToast: false });
      return 0;
    }
  }, [queryClient]);

  return { demoteOrphanedVariants };
}
