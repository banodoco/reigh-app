import type { QueryClient } from '@tanstack/react-query';
import { getSupabaseClient } from '@/integrations/supabase/client';
import { queryKeys } from '@/shared/lib/queryKeys';
import { isSegmentChildrenQueryKey, isSegmentParentsQueryKey } from '@/shared/lib/queryKeys/segments';
import { normalizeAndPresentAndRethrow } from '@/shared/lib/errorHandling/runtimeError';
import { resolveTravelPairShotGenerationId } from '@/shared/lib/tasks/travelPayloadReader';

interface DeleteSegmentGenerationGroupInput {
  generationId: string;
  projectId: string;
}

interface DeleteSegmentGenerationGroupResult {
  deleted: boolean;
  idsToDelete: string[];
  parentGenerationId: string | null;
}

export async function deleteSegmentGenerationGroup({
  generationId,
  projectId,
}: DeleteSegmentGenerationGroupInput): Promise<DeleteSegmentGenerationGroupResult> {
  const supabase = getSupabaseClient();

  const { data: beforeData, error: beforeLookupError } = await supabase
    .from('generations')
    .select('id, project_id, parent_generation_id, pair_shot_generation_id, params')
    .eq('id', generationId)
    .eq('project_id', projectId)
    .maybeSingle();

  if (beforeLookupError) {
    normalizeAndPresentAndRethrow(beforeLookupError, {
      context: 'SegmentDelete.lookupGeneration',
      showToast: false,
      logData: { generationId },
    });
  }

  if (!beforeData) {
    return {
      deleted: false,
      idsToDelete: [],
      parentGenerationId: null,
    };
  }

  const paramsObj = beforeData.params as Record<string, unknown> | null;
  const pairShotGenId = resolveTravelPairShotGenerationId(
    paramsObj,
    beforeData.pair_shot_generation_id,
  );

  let idsToDelete = [generationId];
  if (pairShotGenId && beforeData.parent_generation_id) {
    const { data: siblings, error: siblingLookupError } = await supabase
      .from('generations')
      .select('id, pair_shot_generation_id, params')
      .eq('parent_generation_id', beforeData.parent_generation_id)
      .eq('project_id', projectId);

    if (siblingLookupError) {
      normalizeAndPresentAndRethrow(siblingLookupError, {
        context: 'SegmentDelete.lookupSiblingGenerations',
        showToast: false,
        logData: {
          generationId,
          parentGenerationId: beforeData.parent_generation_id,
        },
      });
    }

    idsToDelete = (siblings || [])
      .filter((child) => {
        const childParamsObj = child.params as Record<string, unknown> | null;
        const childPairId = resolveTravelPairShotGenerationId(
          childParamsObj,
          child.pair_shot_generation_id,
        );
        return childPairId === pairShotGenId;
      })
      .map((child) => child.id);
  }

  const { error: deleteError } = await supabase
    .from('generations')
    .delete()
    .in('id', idsToDelete)
    .eq('project_id', projectId);
  if (deleteError) {
    normalizeAndPresentAndRethrow(deleteError, {
      context: 'SegmentDelete.deleteRows',
      showToast: false,
      logData: { generationId, idsToDelete },
    });
  }

  return {
    deleted: true,
    idsToDelete,
    parentGenerationId: beforeData.parent_generation_id ?? null,
  };
}

interface SyncSegmentDeletionCachesInput {
  queryClient: QueryClient;
  projectId: string;
  parentGenerationId: string | null;
  idsToDelete: string[];
}

export async function syncSegmentDeletionCaches({
  queryClient,
  projectId,
  parentGenerationId,
  idsToDelete,
}: SyncSegmentDeletionCachesInput): Promise<void> {
  if (parentGenerationId) {
    const childrenQueryKey = queryKeys.segments.children(parentGenerationId);
    queryClient.setQueryData(childrenQueryKey, (oldData: unknown) => {
      if (!Array.isArray(oldData)) return oldData;
      return oldData.filter((item: { id: string }) => !idsToDelete.includes(item.id));
    });
  }

  queryClient.setQueriesData(
    { predicate: (query) => isSegmentChildrenQueryKey(query.queryKey) },
    (oldData: unknown) => {
      if (Array.isArray(oldData)) {
        return oldData.filter((item: { id: string }) => !idsToDelete.includes(item.id));
      }
      return oldData;
    },
  );

  await queryClient.invalidateQueries({
    predicate: (query) => isSegmentChildrenQueryKey(query.queryKey),
    refetchType: 'all',
  });
  await queryClient.invalidateQueries({
    predicate: (query) => isSegmentParentsQueryKey(query.queryKey),
    refetchType: 'all',
  });
  await queryClient.invalidateQueries({ queryKey: queryKeys.unified.all });
  await queryClient.invalidateQueries({ queryKey: queryKeys.shots.list(projectId) });
}
