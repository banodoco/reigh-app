import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { supabase } from '@/integrations/supabase/client';
import { handleError } from '@/shared/lib/errorHandler';

export function useSegmentDeletion() {
  const SEGMENT_DELETE_LOG_PREFIX = '[SegmentDelete]';
  const queryClient = useQueryClient();
  const [deletingSegmentId, setDeletingSegmentId] = useState<string | null>(null);

  const getPairShotGenIdFromParams = useCallback((params: Record<string, unknown> | null | undefined) => {
    if (!params) return null;
    const individualParams = (params.individual_segment_params || {}) as Record<string, unknown>;
    return (individualParams.pair_shot_generation_id as string) || (params.pair_shot_generation_id as string) || null;
  }, []);

  const handleDeleteSegment = useCallback(async (generationId: string) => {
    setDeletingSegmentId(generationId);
    try {
      const { data: beforeData } = await supabase
        .from('generations')
        .select('id, type, parent_generation_id, location, params, primary_variant_id, pair_shot_generation_id')
        .eq('id', generationId)
        .single();

      if (!beforeData) return;

      const pairShotGenId = beforeData.pair_shot_generation_id || getPairShotGenIdFromParams(beforeData.params as Record<string, unknown> | null);
      const parentId = beforeData.parent_generation_id;
      const childrenQueryKey = parentId ? queryKeys.segments.children(parentId) : null;

      let idsToDelete = [generationId];
      if (pairShotGenId && parentId) {
        const { data: siblings } = await supabase
          .from('generations')
          .select('id, pair_shot_generation_id, params')
          .eq('parent_generation_id', parentId);
        idsToDelete = (siblings || [])
          .filter(child => {
            const childPairId = child.pair_shot_generation_id || getPairShotGenIdFromParams(child.params as Record<string, unknown> | null);
            return childPairId === pairShotGenId;
          })
          .map(child => child.id);
      }

      console.debug(`${SEGMENT_DELETE_LOG_PREFIX} deleting segment group`, {
        generationId: generationId.slice(0, 8),
        parentId: parentId?.slice(0, 8) ?? null,
        pairShotGenId: pairShotGenId?.slice(0, 8) ?? null,
        idsToDelete: idsToDelete.map((id) => id.slice(0, 8)),
      });

      const { error: deleteError } = await supabase
        .from('generations')
        .delete()
        .in('id', idsToDelete);
      if (deleteError) throw new Error(`Failed to delete: ${deleteError.message}`);

      if (childrenQueryKey) {
        queryClient.setQueryData(childrenQueryKey, (oldData: unknown) => {
          if (!Array.isArray(oldData)) return oldData;
          return (oldData as Array<{ id: string }>).filter((item) => !idsToDelete.includes(item.id));
        });
      }

      // Optimistic cache update
      queryClient.setQueriesData(
        { predicate: (query) => query.queryKey[0] === queryKeys.segments.childrenAll[0] },
        (oldData: unknown) => {
          if (!oldData || !Array.isArray(oldData)) return oldData;
          return (oldData as Array<{ id: string }>).filter((item) => !idsToDelete.includes(item.id));
        }
      );

      console.debug(`${SEGMENT_DELETE_LOG_PREFIX} optimistic cache update applied`, {
        parentId: parentId?.slice(0, 8) ?? null,
        queryKey: childrenQueryKey,
      });

      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === queryKeys.segments.childrenAll[0],
        refetchType: 'all'
      });
      await queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] === queryKeys.segments.parentsAll[0],
        refetchType: 'all'
      });
      await queryClient.invalidateQueries({ queryKey: queryKeys.unified.all });
      await queryClient.invalidateQueries({ queryKey: queryKeys.generations.all });
    } catch (error) {
      handleError(error, { context: 'SegmentDelete', toastTitle: 'Failed to delete segment' });
    } finally {
      setDeletingSegmentId(null);
    }
  }, [getPairShotGenIdFromParams, queryClient]);

  return { deletingSegmentId, handleDeleteSegment };
}
