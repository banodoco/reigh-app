import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/shared/lib/queryKeys';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { log } from '@/shared/lib/logger';

const SEGMENT_DELETE_LOG_PREFIX = '[SegmentDeletePersist]';

function shortId(id: string | null | undefined): string | null {
  return id ? id.slice(0, 8) : null;
}

export function useSegmentDeletion() {
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
      log(`${SEGMENT_DELETE_LOG_PREFIX} delete requested`, {
        generationId: shortId(generationId),
      });

      const { data: beforeData } = await supabase().from('generations')
        .select('id, type, parent_generation_id, location, params, primary_variant_id, pair_shot_generation_id')
        .eq('id', generationId)
        .single();

      if (!beforeData) return;

      const pairShotGenId = beforeData.pair_shot_generation_id || getPairShotGenIdFromParams(beforeData.params as Record<string, unknown> | null);
      const parentId = beforeData.parent_generation_id;
      const childrenQueryKey = parentId ? queryKeys.segments.children(parentId) : null;
      log(`${SEGMENT_DELETE_LOG_PREFIX} delete target resolved`, {
        generationId: shortId(beforeData.id),
        parentGenerationId: shortId(parentId),
        pairShotGenerationId: shortId(pairShotGenId),
      });

      let idsToDelete = [generationId];
      if (pairShotGenId && parentId) {
        const { data: siblings } = await supabase().from('generations')
          .select('id, pair_shot_generation_id, params')
          .eq('parent_generation_id', parentId);
        idsToDelete = (siblings || [])
          .filter(child => {
            const childPairId = child.pair_shot_generation_id || getPairShotGenIdFromParams(child.params as Record<string, unknown> | null);
            return childPairId === pairShotGenId;
          })
          .map(child => child.id);
        log(`${SEGMENT_DELETE_LOG_PREFIX} matched sibling segments`, {
          generationId: shortId(generationId),
          parentGenerationId: shortId(parentId),
          pairShotGenerationId: shortId(pairShotGenId),
          deleteCount: idsToDelete.length,
          deleteIds: idsToDelete.map((id) => shortId(id)),
        });
      }

      log(`${SEGMENT_DELETE_LOG_PREFIX} delete rpc start`, {
        deleteCount: idsToDelete.length,
        deleteIds: idsToDelete.map((id) => shortId(id)),
      });
      const { error: deleteError } = await supabase().from('generations')
        .delete()
        .in('id', idsToDelete);
      if (deleteError) throw new Error(`Failed to delete: ${deleteError.message}`);
      log(`${SEGMENT_DELETE_LOG_PREFIX} delete rpc succeeded`, {
        deleteCount: idsToDelete.length,
      });

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
      log(`${SEGMENT_DELETE_LOG_PREFIX} cache invalidation complete`, {
        generationId: shortId(generationId),
      });
    } catch (error) {
      log(`${SEGMENT_DELETE_LOG_PREFIX} delete failed`, {
        generationId: shortId(generationId),
        error,
      });
      normalizeAndPresentError(error, { context: 'SegmentDelete', toastTitle: 'Failed to delete segment' });
    } finally {
      setDeletingSegmentId(null);
    }
  }, [getPairShotGenIdFromParams, queryClient]);

  return { deletingSegmentId, handleDeleteSegment };
}
