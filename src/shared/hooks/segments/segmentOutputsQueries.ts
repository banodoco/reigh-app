import { GenerationRow } from '@/domains/generation/types';
import { getSupabaseClient as supabase } from '@/integrations/supabase/client';
import { normalizeAndPresentError } from '@/shared/lib/errorHandling/runtimeError';
import { segmentQueryKeys } from '@/shared/lib/queryKeys/segments';
import { LiveTimelineRow, RawGenerationDbRow } from './segmentOutputTypes';
import { transformToGenerationRow } from './segmentDataTransforms';

export function buildParentGenerationsQueryKey(
  shotId: string,
  projectId: string | null,
) {
  return segmentQueryKeys.parents(shotId, projectId ?? undefined);
}

export async function fetchParentGenerations(
  shotId: string,
  projectId: string | null,
): Promise<GenerationRow[]> {
  if (!projectId) return [];
  const { data, error } = await supabase().from('shot_final_videos')
    .select('*')
    .eq('shot_id', shotId)
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });

  if (error) {
    normalizeAndPresentError(error, {
      context: 'useSegmentOutputsForShot.fetchParents',
      showToast: false,
      logData: { shotId, projectId },
    });
    throw error;
  }

  return ((data || []) as unknown as RawGenerationDbRow[]).map(transformToGenerationRow);
}

export function buildChildrenQueryKey(selectedParentId: string) {
  return segmentQueryKeys.children(selectedParentId);
}

export async function fetchChildGenerations(selectedParentId: string): Promise<GenerationRow[]> {
  const { data, error } = await supabase().from('generations')
    .select('*')
    .eq('parent_generation_id', selectedParentId)
    .order('child_order', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) {
    normalizeAndPresentError(error, {
      context: 'useSegmentOutputsForShot.fetchChildren',
      showToast: false,
      logData: { selectedParentId },
    });
    throw error;
  }

  return ((data || []) as unknown as RawGenerationDbRow[]).map(transformToGenerationRow);
}

export function buildLiveTimelineQueryKey(shotId: string) {
  return segmentQueryKeys.liveTimeline(shotId);
}

export async function fetchLiveTimeline(shotId: string): Promise<LiveTimelineRow[]> {
  const { data, error } = await supabase().from('shot_generations')
    .select('id, generation_id, timeline_frame')
    .eq('shot_id', shotId)
    .gte('timeline_frame', 0)
    .order('timeline_frame', { ascending: true });

  if (error) {
    normalizeAndPresentError(error, {
      context: 'useSegmentOutputsForShot.fetchLiveTimeline',
      showToast: false,
      logData: { shotId },
    });
    throw error;
  }

  return (data || []) as LiveTimelineRow[];
}
