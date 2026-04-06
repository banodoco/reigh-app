/**
 * Duplicate an image in a shot by creating a NEW generation via an atomic RPC.
 * Extracted from useShotGenerationMutations for single-responsibility.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { toast } from '@/shared/components/ui/runtime/sonner';
import { enqueueGenerationsInvalidation } from '@/shared/hooks/invalidation';
import { invalidateShotsQueries } from '@/shared/hooks/shots/cacheUtils';
import { queryKeys } from '@/shared/lib/queryKeys';

interface DuplicateAsNewGenerationInput {
  shot_id: string;
  generation_id: string;
  project_id: string;
  timeline_frame: number;
  next_timeline_frame?: number;
}

interface DuplicateAsNewGenerationResult {
  created_at: string;
  location: string;
  thumbnail_url: string | null;
  type: string | null;
  params: unknown;
  shot_id: string;
  original_generation_id: string;
  new_generation_id: string;
  new_shot_generation_id: string;
  timeline_frame: number;
  project_id: string;
}

async function duplicateAsNewGeneration(
  input: DuplicateAsNewGenerationInput
): Promise<DuplicateAsNewGenerationResult> {
  const { data, error } = await supabase().rpc('duplicate_as_new_generation', {
    p_shot_id: input.shot_id,
    p_generation_id: input.generation_id,
    p_project_id: input.project_id,
    p_timeline_frame: input.timeline_frame,
    p_next_timeline_frame: input.next_timeline_frame,
  })
    .single();

  if (error) {
    throw error;
  }

  const typedData = data as Partial<DuplicateAsNewGenerationResult> | null;
  if (
    !typedData?.new_generation_id
    || !typedData.new_shot_generation_id
    || typeof typedData.timeline_frame !== 'number'
    || typeof typedData.location !== 'string'
    || typeof typedData.created_at !== 'string'
  ) {
    throw new Error('Failed to duplicate image');
  }

  return {
    shot_id: input.shot_id,
    original_generation_id: input.generation_id,
    new_generation_id: typedData.new_generation_id,
    new_shot_generation_id: typedData.new_shot_generation_id,
    timeline_frame: typedData.timeline_frame,
    project_id: input.project_id,
    location: typedData.location,
    thumbnail_url: typedData.thumbnail_url ?? null,
    type: typedData.type ?? null,
    params: typedData.params,
    created_at: typedData.created_at,
  };
}

export const useDuplicateAsNewGeneration = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: duplicateAsNewGeneration,
    onSuccess: (data) => {
      enqueueGenerationsInvalidation(queryClient, data.shot_id, {
        reason: 'duplicate-as-new-generation',
        scope: 'all',
        includeShots: false,
        projectId: data.project_id,
        includeProjectUnified: true,
      });
      invalidateShotsQueries(queryClient, data.project_id, { refetchType: 'inactive' });
      queryClient.invalidateQueries({
        queryKey: queryKeys.generations.derivedGenerations(data.original_generation_id),
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.segments.parents(data.shot_id, data.project_id),
      });
    },
    onError: (error: Error) => {
      toast.error(`Failed to duplicate image: ${error.message}`);
    },
  });
};
